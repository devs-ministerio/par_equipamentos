"""Roda o pipeline real de PET_CT (DEMAS + SIDRA + ElastiCNES) e grava o
resultado no banco -- terceira familia do SIGEO (decisao 2026-08-28), copiado
de scripts/run_pipeline_ressonancia.py trocando o que e especifico da
familia (fetch do ElastiCNES e a produtividade), mais o calculo de
distancia/tempo ate o radiofarmaco mais proximo (nao existe no Tomografo
nem na Ressonancia -- ver app/pipeline/radiofarmaco.py).

Uso: python -m scripts.run_pipeline_pet_ct (de dentro de backend/, venv ativo)

Metodologia (Portaria de Consolidacao GM/MS n. 1/2017, art. 102-106):
  - 1 PET_CT para cada 1.500.000 habitantes.
  PRODUTIVIDADE abaixo e esse numero (habitantes por equipamento) --
  calcular_cobertura() ja e generica o bastante pra receber qualquer
  produtividade, mesma formula do TOMOGRAFO/RESSONANCIA, so muda o valor.

  A mesma portaria tambem fixa um criterio de ACESSO AO RADIOFARMACO (FDG,
  meia-vida de 110 min): o PET_CT deve estar a uma distancia que permita
  receber o radiofarmaco em ate 2h. So o criterio populacional (1,5 milhao)
  entra no calculo de cobertura/deficit por enquanto -- o de tempo de acesso
  ao radiofarmaco fica so informativo (distance_km_nearest_radiopharma /
  hours_road_nearest_radiopharma / hours_air_nearest_radiopharma em
  MunicipalityCoverage), mesmo tratamento que o raio de 75km do TOMOGRAFO
  (app/pipeline/geo.py) -- decisao normativa de aplicar isso na
  classificacao oficial de deficit ainda pendente de confirmacao.

Oferta vem 100% do ElastiCNES, demanda 100% de DEMAS (dimensao) + SIDRA
(populacao residente, ao vivo) + arquivo de referencia de populacao ANS
(scripts/importar_populacao_municipios.py, sem API oficial ao vivo
conhecida pra beneficiarios de plano de saude). Denominador de oferta =
qt_uso-onde-sus_flag (decisao 2026-08-24, vale igual pra toda familia --
antes era qt_existente_sus/D-02, 2026-08-21); populacao SUS-dependente
(residente - ANS) idem."""
from __future__ import annotations

from sqlalchemy import delete, func, select

from app.db.base import SessionLocal
from app.db.models import (
    Competency,
    EquipmentOfferRow,
    Execution,
    ExecutionMode,
    ExecutionStatus,
    MacroCoverage,
    MunicipalityCoverage,
    MunicipalityPopulationRow,
    ReferenceFile,
    ReferenceFileType,
)
from app.pipeline import api_demas, api_elasticnes, api_sidra
from app.pipeline.cobertura import OfertaAgregada, calcular_cobertura, nova_oferta_agregada, populacao_sus_dependente
from app.pipeline.geo import carregar_coordenadas_municipios
from app.pipeline.radiofarmaco import (
    carregar_produtores_radiofarmaco_pet,
    horas_aviao,
    horas_rodovia,
    produtor_mais_proximo,
)
from app.pipeline.runner import executar_com_registro_de_falha

FAMILIA = "PET_CT"
# 1 PET_CT por 1.500.000 habitantes (Portaria de Consolidacao GM/MS n.
# 1/2017, art. 102-106).
PRODUTIVIDADE = 1_500_000


def _competency_label(competencia_aaaamm: str) -> str:
    return f"{competencia_aaaamm[:4]}-{competencia_aaaamm[4:]}"


def _buscar_ans_por_municipio() -> dict[str, int]:
    """Populacao ANS (beneficiarios de plano de saude) do arquivo de
    referencia ativo mais recente -- ver scripts/importar_populacao_municipios.py.
    Sem API oficial ao vivo conhecida pra isso (diferente de population_residente,
    que continua vindo do SIDRA ao vivo). Devolve {} se ninguem rodou o
    importador ainda -- nesse caso o pipeline segue rodando, so sem parcela
    ANS (sus_dependente = residente inteiro, RN de fallback documentada abaixo)."""
    db = SessionLocal()
    try:
        reference_file_id = db.execute(
            select(ReferenceFile.id)
            .where(ReferenceFile.type == ReferenceFileType.population, ReferenceFile.active.is_(True))
            .order_by(ReferenceFile.uploaded_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if reference_file_id is None:
            return {}
        linhas = db.execute(
            select(MunicipalityPopulationRow.ibge_code, MunicipalityPopulationRow.ans_population).where(
                MunicipalityPopulationRow.reference_file_id == reference_file_id
            )
        ).all()
        return {ibge: ans for ibge, ans in linhas}
    finally:
        db.close()


def run() -> None:
    print("1/4 - Baixando dim_municipio/dim_macrorregiao da API DEMAS...")
    registros_demas = api_demas.buscar_municipios_macrorregiao()
    macros, regioes, municipios = api_demas.montar_dimensoes(registros_demas)
    print(f"   {len(municipios)} municipios, {len(macros)} macrorregioes, {len(regioes)} regioes de saude.")

    print("2/4 - Baixando populacao estimada mais recente do SIDRA...")
    populacao, ano_pop = api_sidra.buscar_populacao_municipios()
    print(f"   Populacao {ano_pop} de {len(populacao)} municipios.")

    ans_por_municipio = _buscar_ans_por_municipio()
    if ans_por_municipio:
        print(f"   Populacao ANS de {len(ans_por_municipio)} municipios (arquivo de referencia ativo).")
    else:
        print("   [AVISO] sem arquivo de populacao ANS importado -- rode "
              "'python -m scripts.importar_populacao_municipios' antes pra ter SUS-dependente "
              "de verdade. Por enquanto, sus_dependente = residente inteiro (sem desconto de ANS).")

    print("3/4 - Baixando inventario de PET_CT do ElastiCNES...")
    equipamentos, competencia_elasticnes = api_elasticnes.buscar_equipamentos_pet_ct()
    print(f"   {len(equipamentos)} registros (competencia {competencia_elasticnes}).")

    print("4/4 - Agregando por macrorregiao e gravando no banco...")

    # Oferta por macro E por municipio: soma qt_existente (total, so pro
    # card informativo) e qt_uso-onde-SUS (denominador_oferta, 2026-08-24 --
    # equipamento em uso e SUS) + contagem de estabelecimentos. Por
    # municipio e o que alimenta municipality_coverage (tabela "Cobertura
    # Assistencial" quando o filtro afunila ate Municipio/CNES); por macro
    # continua alimentando macro_coverage, ja existente.
    oferta_por_macro: dict[str, OfertaAgregada] = {}
    oferta_por_municipio: dict[str, OfertaAgregada] = {}
    linhas_equipamento = []
    municipios_sem_match = 0

    for eq in equipamentos:
        municipio = municipios.get(eq["co_ibge"])
        if municipio is None:
            municipios_sem_match += 1  # RN-06: nao inventa macro, so nao agrega
        else:
            agg_macro = oferta_por_macro.setdefault(
                municipio["co_macro"], nova_oferta_agregada()
            )
            agg_macro["existente"] += eq["qt_existente"]
            agg_muni = oferta_por_municipio.setdefault(
                eq["co_ibge"], nova_oferta_agregada()
            )
            agg_muni["existente"] += eq["qt_existente"]
            if eq["fl_sus"]:
                agg_macro["uso_sus"] += eq["qt_uso"]
                agg_muni["uso_sus"] += eq["qt_uso"]
            agg_macro["estabelecimentos"].add(eq["co_cnes"])
            agg_muni["estabelecimentos"].add(eq["co_cnes"])

        linhas_equipamento.append(
            EquipmentOfferRow(
                cnes_code=eq["co_cnes"],
                facility_name=eq["no_fantasia"],  # NOME FANTASIA, ja vem no mesmo indice do ElastiCNES
                ibge_code=eq["co_ibge"],
                municipality_name=municipio["no_municipio"] if municipio else None,
                macro_code=municipio["co_macro"] if municipio else None,
                macro_name=macros[municipio["co_macro"]]["no_macro"] if municipio else None,
                health_region_code=municipio["co_regiao"] if municipio else None,
                health_region_name=regioes[municipio["co_regiao"]]["no_regiao"] if municipio else None,
                state=eq["sg_uf"],
                equipment_family=FAMILIA,
                equipment_subtype=eq["ds_subtipo"],
                existing_qty=eq["qt_existente"],
                in_use_qty=eq["qt_uso"],
                sus_flag=eq["fl_sus"],
                latitude=eq["latitude"],
                longitude=eq["longitude"],
                legal_nature=eq["natureza_juridica"],
            )
        )

    if municipios_sem_match:
        print(f"   [AVISO] {municipios_sem_match} registro(s) do ElastiCNES sem municipio correspondente no DEMAS.")

    # Distancia/tempo ate o radiofarmaco (FDG) mais proximo -- diferente do
    # raio de 75km do TOMOGRAFO, o "ponto" de referencia aqui e uma lista
    # FIXA de produtores vendorizada (nao muda por competencia do ElastiCNES,
    # ver app/pipeline/radiofarmaco.py), nao o equipamento em si.
    produtores_radiofarmaco = carregar_produtores_radiofarmaco_pet()
    coordenadas_municipios = carregar_coordenadas_municipios()
    print(
        f"   Radiofarmaco: {len(produtores_radiofarmaco)} produtor(es) PET vendorizado(s); "
        f"{len(coordenadas_municipios)} município(s) com coordenada de referência."
    )

    # Populacao por macro: soma, por municipio pertencente aquela macro
    # (RN-05 -- toda macro aparece, mesmo sem oferta):
    #   residente   = SIDRA ao vivo (IBGE)
    #   ans         = arquivo de referencia (beneficiarios de plano de saude)
    #   sus_dependente = residente - ans, nunca negativa (populacao_sus_dependente)
    #     -- e o denominador de DEMANDA usado no calculo (RN, D-02 ja fixa
    #     que a OFERTA e so SUS; faz sentido comparar contra quem depende do
    #     SUS, nao a populacao total, que inclui quem tem plano privado).
    residente_por_macro: dict[str, int] = {}
    ans_por_macro: dict[str, int] = {}
    sus_por_macro: dict[str, int] = {}
    for co_ibge, municipio in municipios.items():
        residente = populacao.get(co_ibge)
        if residente is None:
            continue
        ans = ans_por_municipio.get(co_ibge, 0)
        co_macro = municipio["co_macro"]
        residente_por_macro[co_macro] = residente_por_macro.get(co_macro, 0) + residente
        ans_por_macro[co_macro] = ans_por_macro.get(co_macro, 0) + ans
        sus_por_macro[co_macro] = sus_por_macro.get(co_macro, 0) + populacao_sus_dependente(residente=residente, ans=ans)

    db = SessionLocal()
    try:
        label = _competency_label(competencia_elasticnes)
        competency = db.execute(
            select(Competency).where(Competency.label == label, Competency.equipment_family == FAMILIA)
        ).scalar_one_or_none()
        if competency is None:
            competency = Competency(label=label, equipment_family=FAMILIA)
            db.add(competency)
            db.flush()
            proxima_versao = 1
        else:
            # ja existe uma execucao pra essa competencia (rodar de novo antes
            # do ElastiCNES publicar a proxima) -- versiona em vez de duplicar
            # a competency (label e UNIQUE).
            ultima_versao = db.execute(
                select(func.max(Execution.version)).where(Execution.competency_id == competency.id)
            ).scalar_one()
            proxima_versao = (ultima_versao or 0) + 1

        execution = Execution(
            competency_id=competency.id,
            version=proxima_versao,
            mode=ExecutionMode.automatic,
            status=ExecutionStatus.published,
            config_chave_macrorregiao="ibge_municipio",
            config_denominador_oferta="qt_uso_sus",
            active_sources={
                "elasticnes": True, "sidra": True, "demas": True,
                "populacao_ans_arquivo": bool(ans_por_municipio),
            },
        )
        db.add(execution)
        db.flush()

        for co_macro, macro in macros.items():
            population_residente = residente_por_macro.get(co_macro, 0)
            population_ans = ans_por_macro.get(co_macro, 0)
            population_sus = sus_por_macro.get(co_macro, 0)
            oferta = oferta_por_macro.get(co_macro, nova_oferta_agregada())
            cobertura = calcular_cobertura(
                population=population_sus, in_use_sus=int(oferta["uso_sus"]), produtividade=PRODUTIVIDADE
            )
            db.add(
                MacroCoverage(
                    execution_id=execution.id,
                    macro_code=co_macro,
                    macro_name=macro["no_macro"],
                    state=macro["sg_uf"],
                    equipment_family=FAMILIA,
                    population=population_sus,
                    population_residente=population_residente,
                    population_ans=population_ans,
                    estimated_need=cobertura.estimated_need,
                    required_qty=cobertura.required_qty,
                    available_qty=cobertura.available_qty,
                    existing_qty=int(oferta["existente"]),
                    facility_count=len(oferta["estabelecimentos"]),
                    balance=cobertura.balance,
                    deficit_status=cobertura.deficit_status,
                )
            )

        # Mesma coisa, mas por municipio (RN-05 tambem vale aqui -- todo
        # municipio do DEMAS entra, mesmo sem oferta nem populacao SIDRA
        # daquele ano, com os campos numericos em 0).
        for co_ibge, municipio in municipios.items():
            residente = populacao.get(co_ibge, 0)
            ans = ans_por_municipio.get(co_ibge, 0)
            population_sus_muni = populacao_sus_dependente(residente=residente, ans=ans)
            oferta_muni = oferta_por_municipio.get(
                co_ibge, nova_oferta_agregada()
            )
            cobertura_muni = calcular_cobertura(
                population=population_sus_muni, in_use_sus=int(oferta_muni["uso_sus"]),
                produtividade=PRODUTIVIDADE,
            )

            # So informativo -- NAO entra em cobertura_muni/deficit_status
            # (ver app/pipeline/radiofarmaco.py). None se o municipio nao
            # tiver coordenada de referencia (nao deveria acontecer, os
            # 5.570 ja foram validados no TOMOGRAFO).
            coordenada_municipio = coordenadas_municipios.get(co_ibge)
            distancia_radiofarmaco = None
            horas_rodovia_radiofarmaco = None
            horas_aviao_radiofarmaco = None
            if coordenada_municipio:
                resultado = produtor_mais_proximo(coordenada_municipio, produtores_radiofarmaco)
                if resultado is not None:
                    _, distancia_radiofarmaco = resultado
                    horas_rodovia_radiofarmaco = horas_rodovia(distancia_radiofarmaco)
                    horas_aviao_radiofarmaco = horas_aviao(distancia_radiofarmaco)

            db.add(
                MunicipalityCoverage(
                    execution_id=execution.id,
                    ibge_code=co_ibge,
                    municipality_name=municipio["no_municipio"],
                    health_region_code=municipio["co_regiao"],
                    health_region_name=regioes[municipio["co_regiao"]]["no_regiao"],
                    macro_code=municipio["co_macro"],
                    macro_name=macros[municipio["co_macro"]]["no_macro"],
                    state=municipio["sg_uf"],
                    equipment_family=FAMILIA,
                    population=population_sus_muni,
                    population_residente=residente,
                    population_ans=ans,
                    estimated_need=cobertura_muni.estimated_need,
                    required_qty=cobertura_muni.required_qty,
                    available_qty=cobertura_muni.available_qty,
                    existing_qty=int(oferta_muni["existente"]),
                    facility_count=len(oferta_muni["estabelecimentos"]),
                    balance=cobertura_muni.balance,
                    deficit_status=cobertura_muni.deficit_status,
                    distance_km_nearest_radiopharma=distancia_radiofarmaco,
                    hours_road_nearest_radiopharma=horas_rodovia_radiofarmaco,
                    hours_air_nearest_radiopharma=horas_aviao_radiofarmaco,
                )
            )

        for linha in linhas_equipamento:
            linha.execution_id = execution.id
        db.add_all(linhas_equipamento)

        # Politica de versao unica por competencia: a execucao recem-criada
        # vira a publicada e as anteriores DA MESMA competencia sao removidas.
        # Sem isso cada re-execucao no mesmo mes empilhava ~8 mil linhas
        # identicas (o banco chegou a ter 75% de dado redundante). O historico
        # entre meses diferentes continua preservado -- so a duplicata some.
        anteriores = db.execute(
            select(Execution.id).where(
                Execution.competency_id == competency.id,
                Execution.id != execution.id,
            )
        ).scalars().all()

        competency.published_execution_id = execution.id
        # flush explicito: sem isso, o DELETE de Execution logo abaixo (um
        # db.execute() de Core, que nao dispara autoflush do jeito que uma
        # query ORM dispara) pode rodar antes do UPDATE de
        # competency.published_execution_id ser emitido -- FK ainda aponta
        # pra execution antiga e o DELETE quebra com ForeignKeyViolation.
        # Bug real, encontrado rodando o pipeline pela primeira vez com uma
        # competencia ja existente nesta sessao (2026-08-21).
        db.flush()

        if anteriores:
            db.execute(delete(MacroCoverage).where(MacroCoverage.execution_id.in_(anteriores)))
            db.execute(delete(MunicipalityCoverage).where(MunicipalityCoverage.execution_id.in_(anteriores)))
            db.execute(delete(EquipmentOfferRow).where(EquipmentOfferRow.execution_id.in_(anteriores)))
            db.execute(delete(Execution).where(Execution.id.in_(anteriores)))

        db.commit()
        print(f"Concluido -- competency={competency.id} execution={execution.id}, "
              f"{len(macros)} macrorregioes, {len(municipios)} municipios, "
              f"{len(linhas_equipamento)} linhas de equipamento.")
        if anteriores:
            print(f"   Versoes anteriores de {label} removidas: {sorted(anteriores)}")
    finally:
        db.close()


if __name__ == "__main__":
    executar_com_registro_de_falha(FAMILIA, run)
