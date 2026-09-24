"""Cenário sintético mínimo para contratos de cobertura.

Não executa pipeline nem usa dado real: sua finalidade é tornar os testes de
integração determinísticos no PostgreSQL efêmero do CI.
"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, select

from app.db.base import SessionLocal
from app.db.models import (
    CnesEstabelecimento,
    Competency,
    Convenio,
    DeficitStatus,
    EquipmentOfferRow,
    Execution,
    ExecutionMode,
    ExecutionStatus,
    MacroCoverage,
    MunicipalityCoverage,
)

_LABEL = "__pytest_cobertura_tomografo__"


def seed_cobertura() -> None:
    """Cria uma execução TOMOGRAFO com três municípios e três estabelecimentos.

    Duas regiões de saúde no mesmo macro permitem validar a agregação. As
    linhas de oferta somam exatamente os agregados: `existing_qty=6` e
    `available_qty=3`, sendo disponibilidade somente SUS e em uso.
    """
    db = SessionLocal()
    try:
        competencia_anterior = db.scalar(
            select(Competency).where(Competency.label == _LABEL, Competency.equipment_family == "TOMOGRAFO")
        )
        if competencia_anterior is not None:
            db.execute(delete(Execution).where(Execution.competency_id == competencia_anterior.id))
            db.execute(delete(Competency).where(Competency.id == competencia_anterior.id))
            db.flush()

        competencia = Competency(label=_LABEL, equipment_family="TOMOGRAFO")
        db.add(competencia)
        db.flush()
        execucao = Execution(
            competency_id=competencia.id,
            version=1,
            mode=ExecutionMode.manual,
            status=ExecutionStatus.published,
            started_at=datetime.now(UTC),
            config_chave_macrorregiao="pytest",
            config_denominador_oferta="sus_em_uso",
            active_sources={},
        )
        db.add(execucao)
        db.flush()

        municipios = [
            ("0000001", "Cidade Alfa", "R1", "Região Um", 120_000, 2, 1, 2),
            ("0000002", "Cidade Beta", "R1", "Região Um", 80_000, 1, 0, 1),
            ("0000003", "Cidade Gama", "R2", "Região Dois", 110_000, 2, 2, 3),
        ]
        for ibge, nome, regiao, nome_regiao, populacao, requerida, disponivel, existente in municipios:
            db.add(
                MunicipalityCoverage(
                    execution_id=execucao.id,
                    ibge_code=ibge,
                    municipality_name=nome,
                    health_region_code=regiao,
                    health_region_name=nome_regiao,
                    macro_code="M1",
                    macro_name="Macro Um",
                    state="DF",
                    equipment_family="TOMOGRAFO",
                    population=populacao,
                    population_residente=populacao,
                    population_ans=0,
                    estimated_need=float(requerida),
                    required_qty=requerida,
                    available_qty=disponivel,
                    existing_qty=existente,
                    facility_count=1,
                    balance=disponivel - requerida,
                    deficit_status=DeficitStatus.deficient if disponivel < requerida else DeficitStatus.not_deficient,
                )
            )
            db.add(
                EquipmentOfferRow(
                    execution_id=execucao.id,
                    cnes_code=f"900000{ibge[-1]}",
                    facility_name=f"Hospital {nome}",
                    ibge_code=ibge,
                    municipality_name=nome,
                    macro_code="M1",
                    macro_name="Macro Um",
                    health_region_code=regiao,
                    health_region_name=nome_regiao,
                    state="DF",
                    equipment_family="TOMOGRAFO",
                    existing_qty=existente,
                    in_use_qty=disponivel if disponivel else 1,
                    sus_flag=disponivel > 0,
                    latitude={"Cidade Alfa": 0.0, "Cidade Beta": 0.1, "Cidade Gama": 10.0}[nome],
                    longitude=0.0,
                    legal_nature="PUBLICO",
                )
            )

        db.add(
            MacroCoverage(
                execution_id=execucao.id,
                macro_code="M1",
                macro_name="Macro Um",
                state="DF",
                equipment_family="TOMOGRAFO",
                population=310_000,
                population_residente=310_000,
                population_ans=0,
                estimated_need=4.0,
                required_qty=4,
                available_qty=3,
                existing_qty=6,
                facility_count=3,
                balance=-1,
                deficit_status=DeficitStatus.deficient,
            )
        )

        cnes = db.get(CnesEstabelecimento, "9000001")
        if cnes is None:
            db.add(CnesEstabelecimento(cnes="9000001", nome_estabelecimento="CNES Pytest", uf="DF"))
        if db.scalar(select(Convenio.id).where(Convenio.numero == "__pytest_cnes_fk__")) is None:
            db.add(Convenio(numero="__pytest_cnes_fk__", convenente_nome="Convênio Pytest", cnes="9000001"))
        db.commit()
    finally:
        db.close()
