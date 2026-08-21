"""Leitura de municipality_coverage (granularidade fina da "Cobertura
Assistencial" do Dashboard) -- so GET, escrita pelo mesmo
scripts/run_pipeline_tomografo.py que grava macro_coverage.

Dois niveis:
  GET /municipality-coverage    -- uma linha por municipio (a tabela quando
                                    o filtro escolhido afunila ate
                                    Municipio/CNES).
  GET /health-region-coverage   -- agregado por regiao de saude, computado
                                    em tempo de leitura (GROUP BY sobre
                                    municipality_coverage, com o mesmo
                                    calculo de calcular_cobertura aplicado
                                    na soma -- igual ja acontece com macro,
                                    que tambem agrega municipios antes de
                                    calcular required_qty/balance).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import Execution, MunicipalityCoverage
from app.pipeline.cobertura import calcular_cobertura
from app.schemas import HealthRegionCoverageRead, MunicipalityCoverageRead

router = APIRouter(tags=["cobertura-assistencial"])


def _latest_execution_id(db: Session) -> int | None:
    stmt = select(Execution.id).order_by(Execution.started_at.desc()).limit(1)
    return db.execute(stmt).scalar_one_or_none()


def _filtrar_municipio(stmt, municipality: list[str] | None):
    """Mesma chave composta "NOME|UF" usada em equipment_offer_row (varios
    municipios brasileiros compartilham nome entre estados)."""
    if not municipality:
        return stmt
    condicoes = []
    for item in municipality:
        nome, _, uf = item.partition("|")
        if uf:
            condicoes.append(and_(MunicipalityCoverage.municipality_name == nome, MunicipalityCoverage.state == uf))
        else:
            condicoes.append(MunicipalityCoverage.municipality_name == nome)
    return stmt.where(or_(*condicoes))


@router.get("/municipality-coverage", response_model=list[MunicipalityCoverageRead])
def listar_municipality_coverage(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    health_region_code: list[str] | None = Query(default=None),
    municipality: list[str] | None = Query(default=None),
    # RN especifica de TOMOGRAFO (nao generaliza pra outras familias): um
    # municipio abaixo do parametro normativo (100 mil hab.) nao era esperado
    # ter equipamento proprio -- listar esses so gera ruido quando o filtro
    # afunila so ate Regiao de Saude. Ignorado quando o front ja pediu um(ns)
    # municipio(s)/CNES especifico(s) (o usuario escolheu ver aquele, do
    # tamanho que for).
    min_population: int | None = Query(default=None, ge=0),
    db: Session = Depends(get_db),
) -> list[MunicipalityCoverageRead]:
    exec_id = execution_id or _latest_execution_id(db)
    if exec_id is None:
        return []

    stmt = select(MunicipalityCoverage).where(MunicipalityCoverage.execution_id == exec_id)
    if equipment_family:
        stmt = stmt.where(MunicipalityCoverage.equipment_family == equipment_family)
    if state:
        stmt = stmt.where(MunicipalityCoverage.state.in_(state))
    if macro_code:
        stmt = stmt.where(MunicipalityCoverage.macro_code.in_(macro_code))
    if health_region_code:
        stmt = stmt.where(MunicipalityCoverage.health_region_code.in_(health_region_code))
    stmt = _filtrar_municipio(stmt, municipality)
    if min_population is not None:
        stmt = stmt.where(MunicipalityCoverage.population >= min_population)

    rows = db.execute(stmt).scalars().all()
    resultado = []
    for r in rows:
        data = MunicipalityCoverageRead.model_validate(r)
        if r.required_qty:
            data.coverage_percentage = round((r.available_qty or 0) / r.required_qty * 100, 1)
        resultado.append(data)
    return resultado


@router.get("/health-region-coverage", response_model=list[HealthRegionCoverageRead])
def listar_health_region_coverage(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[HealthRegionCoverageRead]:
    """Sem min_population -- o parametro de "municipio pequeno demais pra ter
    equipamento proprio" so faz sentido no nivel de municipio; uma regiao de
    saude e sempre um agregado de varios municipios, populacao ja pool
    naturalmente (RN: required_qty da regiao = ceil(populacao somada /
    100_000), nao soma dos ceils individuais -- senao superestimaria
    demanda ao contar cada municipio pequeno como exigindo 1 aparelho
    proprio)."""
    exec_id = execution_id or _latest_execution_id(db)
    if exec_id is None:
        return []

    stmt = (
        select(
            MunicipalityCoverage.health_region_code,
            func.max(MunicipalityCoverage.health_region_name).label("health_region_name"),
            func.max(MunicipalityCoverage.macro_code).label("macro_code"),
            func.max(MunicipalityCoverage.macro_name).label("macro_name"),
            func.max(MunicipalityCoverage.state).label("state"),
            func.sum(MunicipalityCoverage.population).label("population"),
            func.sum(MunicipalityCoverage.population_residente).label("population_residente"),
            func.sum(MunicipalityCoverage.population_ans).label("population_ans"),
            func.sum(MunicipalityCoverage.existing_qty).label("existing_qty"),
            func.sum(MunicipalityCoverage.available_qty).label("available_qty"),
            func.sum(MunicipalityCoverage.facility_count).label("facility_count"),
        )
        .where(
            MunicipalityCoverage.execution_id == exec_id,
            MunicipalityCoverage.health_region_code.is_not(None),
        )
        .group_by(MunicipalityCoverage.health_region_code)
    )
    if equipment_family:
        stmt = stmt.where(MunicipalityCoverage.equipment_family == equipment_family)
    if state:
        stmt = stmt.where(MunicipalityCoverage.state.in_(state))
    if macro_code:
        stmt = stmt.where(MunicipalityCoverage.macro_code.in_(macro_code))

    linhas = db.execute(stmt).mappings().all()
    resultado = []
    for r in linhas:
        cobertura = calcular_cobertura(population=r["population"] or 0, existing_sus=r["available_qty"] or 0)
        coverage_percentage = round(cobertura.available_qty / cobertura.required_qty * 100, 1) if cobertura.required_qty else None
        resultado.append(
            HealthRegionCoverageRead(
                health_region_code=r["health_region_code"],
                health_region_name=r["health_region_name"],
                macro_code=r["macro_code"],
                macro_name=r["macro_name"],
                state=r["state"],
                equipment_family=equipment_family or "",
                population=r["population"],
                population_residente=r["population_residente"],
                population_ans=r["population_ans"],
                estimated_need=cobertura.estimated_need,
                required_qty=cobertura.required_qty,
                available_qty=cobertura.available_qty,
                existing_qty=r["existing_qty"],
                facility_count=r["facility_count"],
                balance=cobertura.balance,
                deficit_status=cobertura.deficit_status,
                coverage_percentage=coverage_percentage,
            )
        )
    return resultado
