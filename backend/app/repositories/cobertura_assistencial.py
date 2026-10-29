"""Consultas de macro_coverage e municipality_coverage (cobertura assistencial).

Função solta com `db: Session` posicional; só leitura, nunca commita.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.db.models import MacroCoverage, MunicipalityCoverage


def listar_macro_coverage(
    db: Session, exec_id: int, *, equipment_family: str | None, macro_code: list[str] | None, limit: int
) -> Sequence[MacroCoverage]:
    stmt = select(MacroCoverage).where(MacroCoverage.execution_id == exec_id)
    if equipment_family:
        stmt = stmt.where(MacroCoverage.equipment_family == equipment_family)
    if macro_code:
        stmt = stmt.where(MacroCoverage.macro_code.in_(macro_code))
    return db.execute(stmt.limit(limit)).scalars().all()


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


def listar_municipality_coverage(
    db: Session,
    exec_id: int,
    *,
    equipment_family: str | None,
    state: list[str] | None,
    macro_code: list[str] | None,
    health_region_code: list[str] | None,
    municipality: list[str] | None,
    min_population: int | None,
    limit: int,
) -> Sequence[MunicipalityCoverage]:
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
    return db.execute(stmt.limit(limit)).scalars().all()


def agregar_por_regiao_de_saude(
    db: Session,
    exec_id: int,
    *,
    equipment_family: str | None,
    state: list[str] | None,
    macro_code: list[str] | None,
    limit: int,
) -> list[dict[str, Any]]:
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
            func.max(MunicipalityCoverage.equipment_family).label("equipment_family"),
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
    return [dict(r) for r in db.execute(stmt.limit(limit)).mappings().all()]
