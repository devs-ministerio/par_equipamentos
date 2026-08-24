"""Roda o pipeline real de RESSONANCIA (DEMAS + SIDRA + ElastiCNES) e grava o
resultado no banco -- segunda familia do SIEO (decisao 2026-08-21), copiado
de scripts/run_pipeline_tomografo.py trocando so o que e especifico da
familia (fetch do ElastiCNES e a produtividade).

Uso: python -m scripts.run_pipeline_ressonancia (de dentro de backend/, venv ativo)

Metodologia (parametro passado pela area, 2026-08-21):
  - 5.000 exames/ano de capacidade por equipamento
  - necessidade de 30 exames/1.000 habitantes/ano
  => 1 ressonancia cobre 5.000 / (30/1.000) = 166.666,67 habitantes.
  PRODUTIVIDADE abaixo e essa razao (habitantes por equipamento) --
  calcular_cobertura() ja e generica o bastante pra receber qualquer
  produtividade, entao a formula (1 equip. por X habitantes) e a mesma do
  TOMOGRAFO, so muda o X.

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
from app.pipeline.cobertura import calcular_cobertura, populacao_sus_dependente
from app.pipeline.runner import executar_com_registro_de_falha

FAMILIA = "RESSONANCIA"
# 5.000 exames/ano por equipamento; necessidade de 30 exames/1.000 hab/ano
# => 1 equip. por (5_000 / (30 / 1_000)) = 166_666.67 habitantes.
PRODUTIVIDADE = 5_000 / (30 / 1_000)


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

    print("3/4 - Baixando inventario de RESSONANCIA do ElastiCNES...")
    equipamentos, competencia_elasticnes = api_elasticnes.buscar_equipamentos_ressonancia()
    print(f"   {len(equipamentos)} registros (competencia {competencia_elasticnes}).")

    print("4/4 - Agregando por macrorregiao e gravando no banco...")

    # Oferta por macro E por municipio: soma qt_existente (total, so pro
    # card informativo) e qt_uso-onde-SUS (denominador_oferta, 2026-08-24 --
    # equipamento em uso e SUS) + contagem de estabelecimentos. Por
    # municipio e o que alimenta municipality_coverage (tabela "Cobertura
    # Assistencial" quando o filtro afunila ate Municipio/CNES); por macro
    # continua alimentando macro_coverage, ja existente.
    oferta_por_macro: dict[str, dict[str, float]] = {}
    oferta_por_municipio: dict[str, dict[str, float]] = {}
    linhas_equipamento = []
    municipios_sem_match = 0

    for eq in equipamentos:
        municipio = municipios.get(eq["co_ibge"])
        if municipio is None:
            municipios_sem_match += 1  # RN-06: nao inventa macro, so nao agrega
        else:
            agg_macro = oferta_por_macro.setdefault(
                municipio["co_macro"], {"existente": 0, "uso_sus": 0, "estabelecimentos": set()}
            )
            agg_macro["existente"] += eq["qt_existente"]
            agg_muni = oferta_por_municipio.setdefault(
                eq["co_ibge"], {"existente": 0, "uso_sus": 0, "estabelecimentos": set()}
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
            oferta = oferta_por_macro.get(co_macro, {"existente": 0, "uso_sus": 0, "estabelecimentos": set()})
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
                co_ibge, {"existente": 0, "uso_sus": 0, "estabelecimentos": set()}
            )
            cobertura_muni = calcular_cobertura(
                population=population_sus_muni, in_use_sus=int(oferta_muni["uso_sus"]),
                produtividade=PRODUTIVIDADE,
            )
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
