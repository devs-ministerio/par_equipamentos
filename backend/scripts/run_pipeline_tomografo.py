"""Roda o pipeline real de TOMOGRAFO (DEMAS + SIDRA + ElastiCNES) e grava o
resultado no banco -- substitui o seed fake (scripts/seed_tomografo.py) por
dado de verdade, puxado ao vivo das APIs publicas.

Uso: python -m scripts.run_pipeline_tomografo (de dentro de backend/, venv ativo)

Logica portada de src/pipeline.py + src/services/cobertura.py (pipeline
legado), simplificada pra uma unica familia (TOMOGRAFO) sem depender de
planilha nenhuma -- oferta vem 100% do ElastiCNES, demanda 100% de
DEMAS (dimensao)/SIDRA (populacao). D-02 (denominador_oferta =
qt_existente_sus) ja confirmado com a area, aplicado direto aqui.
"""
from __future__ import annotations

import math

from sqlalchemy import delete, func, select

from app.db.base import SessionLocal
from app.db.models import (
    Competency,
    DeficitStatus,
    EquipmentOfferRow,
    Execution,
    ExecutionMode,
    ExecutionStatus,
    MacroCoverage,
)
from app.pipeline import api_demas, api_elasticnes, api_sidra

FAMILIA = "TOMOGRAFO"
PRODUTIVIDADE = 100_000  # 1 tomografo por 100 mil habitantes (Metodologia)


def _competency_label(competencia_aaaamm: str) -> str:
    return f"{competencia_aaaamm[:4]}-{competencia_aaaamm[4:]}"


def run() -> None:
    print("1/4 - Baixando dim_municipio/dim_macrorregiao da API DEMAS...")
    registros_demas = api_demas.buscar_municipios_macrorregiao()
    macros, regioes, municipios = api_demas.montar_dimensoes(registros_demas)
    print(f"   {len(municipios)} municipios, {len(macros)} macrorregioes, {len(regioes)} regioes de saude.")

    print("2/4 - Baixando populacao estimada mais recente do SIDRA...")
    populacao, ano_pop = api_sidra.buscar_populacao_municipios()
    print(f"   Populacao {ano_pop} de {len(populacao)} municipios.")

    print("3/4 - Baixando inventario de TOMOGRAFO do ElastiCNES...")
    equipamentos, competencia_elasticnes = api_elasticnes.buscar_equipamentos_tomografo()
    print(f"   {len(equipamentos)} registros (competencia {competencia_elasticnes}).")

    print("4/4 - Agregando por macrorregiao e gravando no banco...")

    # Oferta por macro: soma qt_existente (total) e qt_existente-onde-SUS
    # (D-02, denominador_oferta confirmado) + contagem de estabelecimentos.
    oferta_por_macro: dict[str, dict[str, float]] = {}
    linhas_equipamento = []
    municipios_sem_match = 0

    for eq in equipamentos:
        municipio = municipios.get(eq["co_ibge"])
        if municipio is None:
            municipios_sem_match += 1  # RN-06: nao inventa macro, so nao agrega
        else:
            agg = oferta_por_macro.setdefault(
                municipio["co_macro"], {"existente": 0, "existente_sus": 0, "estabelecimentos": set()}
            )
            agg["existente"] += eq["qt_existente"]
            if eq["fl_sus"]:
                agg["existente_sus"] += eq["qt_existente"]
            agg["estabelecimentos"].add(eq["co_cnes"])

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
            )
        )

    if municipios_sem_match:
        print(f"   [AVISO] {municipios_sem_match} registro(s) do ElastiCNES sem municipio correspondente no DEMAS.")

    # Populacao por macro: soma a populacao SIDRA de todo municipio que
    # pertence aquela macro (RN-05 -- toda macro aparece, mesmo sem oferta).
    populacao_por_macro: dict[str, int] = {}
    for co_ibge, municipio in municipios.items():
        pop = populacao.get(co_ibge)
        if pop is None:
            continue
        populacao_por_macro[municipio["co_macro"]] = populacao_por_macro.get(municipio["co_macro"], 0) + pop

    db = SessionLocal()
    try:
        label = _competency_label(competencia_elasticnes)
        competency = db.execute(select(Competency).where(Competency.label == label)).scalar_one_or_none()
        if competency is None:
            competency = Competency(label=label)
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
            config_denominador_oferta="qt_existente_sus",
            active_sources={"elasticnes": True, "sidra": True, "demas": True},
        )
        db.add(execution)
        db.flush()

        for co_macro, macro in macros.items():
            population = populacao_por_macro.get(co_macro, 0)
            oferta = oferta_por_macro.get(co_macro, {"existente": 0, "existente_sus": 0, "estabelecimentos": set()})
            required_qty = math.ceil(population / PRODUTIVIDADE) if population else 0
            available_qty = int(oferta["existente_sus"])
            balance = available_qty - required_qty
            db.add(
                MacroCoverage(
                    execution_id=execution.id,
                    macro_code=co_macro,
                    macro_name=macro["no_macro"],
                    state=macro["sg_uf"],
                    equipment_family=FAMILIA,
                    population=population,
                    estimated_need=population / PRODUTIVIDADE if population else 0,
                    required_qty=required_qty,
                    available_qty=available_qty,
                    existing_qty=int(oferta["existente"]),
                    facility_count=len(oferta["estabelecimentos"]),
                    balance=balance,
                    deficit_status=DeficitStatus.not_deficient if balance >= 0 else DeficitStatus.deficient,
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

        if anteriores:
            db.execute(delete(MacroCoverage).where(MacroCoverage.execution_id.in_(anteriores)))
            db.execute(delete(EquipmentOfferRow).where(EquipmentOfferRow.execution_id.in_(anteriores)))
            db.execute(delete(Execution).where(Execution.id.in_(anteriores)))

        db.commit()
        print(f"Concluido -- competency={competency.id} execution={execution.id}, "
              f"{len(macros)} macrorregioes, {len(linhas_equipamento)} linhas de equipamento.")
        if anteriores:
            print(f"   Versoes anteriores de {label} removidas: {sorted(anteriores)}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
