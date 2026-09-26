"""Acesso a MacroCoverage/MunicipalityCoverage para os relatorios (Plan
Mode docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 2).

Extracao minima -- so o necessario pro relatorio (filtro por UF, sem
paginacao); app/routers/{macro_coverage,municipality_coverage}.py continuam
com sua propria query inline (fora de escopo deste plan-mode migrar os 2
routers por completo, ver "Fora de escopo" no plan-mode).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MacroCoverage, MunicipalityCoverage

# Tetos de seguranca do relatorio -- mesmo espirito do Bloco 4 do Plan Mode
# consolidacao 2026-09-17 (nao e paginacao de UI). ~121 macrorregioes e
# ~5570 municipios do Brasil por familia, bem abaixo disso.
LIMITE_MACRO = 1000
LIMITE_MUNICIPIO = 10_000


def listar_macro_coverage(db: Session, *, execution_id: int, ufs: list[str] | None = None) -> list[MacroCoverage]:
    stmt = select(MacroCoverage).where(MacroCoverage.execution_id == execution_id)
    if ufs:
        stmt = stmt.where(MacroCoverage.state.in_(ufs))
    stmt = stmt.order_by(MacroCoverage.state, MacroCoverage.macro_name).limit(LIMITE_MACRO)
    return list(db.execute(stmt).scalars().all())


def listar_municipality_coverage(
    db: Session,
    *,
    execution_id: int,
    ufs: list[str] | None = None,
    municipio: str | None = None,
) -> list[MunicipalityCoverage]:
    stmt = select(MunicipalityCoverage).where(MunicipalityCoverage.execution_id == execution_id)
    if ufs:
        stmt = stmt.where(MunicipalityCoverage.state.in_(ufs))
    if municipio:
        stmt = stmt.where(MunicipalityCoverage.municipality_name == municipio)
    stmt = stmt.order_by(MunicipalityCoverage.state, MunicipalityCoverage.municipality_name).limit(LIMITE_MUNICIPIO)
    return list(db.execute(stmt).scalars().all())
