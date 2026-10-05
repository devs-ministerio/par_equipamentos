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
from app.domain_errors import ValidationError
from app.pipeline.texto import normalizar_texto

# Tetos de seguranca do relatorio -- mesmo espirito do Bloco 4 do Plan Mode
# consolidacao 2026-09-17 (nao e paginacao de UI). ~121 macrorregioes e
# ~5570 municipios do Brasil por familia, bem abaixo disso.
LIMITE_MACRO = 1000
LIMITE_MUNICIPIO = 10_000


def listar_macro_coverage(db: Session, *, execution_id: int, ufs: list[str] | None = None) -> list[MacroCoverage]:
    stmt = select(MacroCoverage).where(MacroCoverage.execution_id == execution_id)
    if ufs:
        stmt = stmt.where(MacroCoverage.state.in_(ufs))
    stmt = stmt.order_by(MacroCoverage.state, MacroCoverage.macro_name, MacroCoverage.id)
    resultado: list[MacroCoverage] = []
    for linha in db.execute(stmt.execution_options(yield_per=500)).scalars():
        resultado.append(linha)
        if len(resultado) > LIMITE_MACRO:
            raise ValidationError("O recorte de macrorregiões excede o limite de exportação.")
    return resultado


def listar_municipality_coverage(
    db: Session,
    *,
    execution_id: int,
    ufs: list[str] | None = None,
    municipio: str | None = None,
) -> list[MunicipalityCoverage]:
    # Município comparado em Python, não em SQL (mesmo achado de
    # app/repositories/convenios.py -- grafia diverge por origem).
    stmt = select(MunicipalityCoverage).where(MunicipalityCoverage.execution_id == execution_id)
    if ufs:
        stmt = stmt.where(MunicipalityCoverage.state.in_(ufs))
    stmt = stmt.order_by(MunicipalityCoverage.state, MunicipalityCoverage.municipality_name, MunicipalityCoverage.id)
    alvo = normalizar_texto(municipio) if municipio else None
    resultado: list[MunicipalityCoverage] = []
    for linha in db.execute(stmt.execution_options(yield_per=500)).scalars():
        if alvo and normalizar_texto(linha.municipality_name) != alvo:
            continue
        resultado.append(linha)
        if len(resultado) > LIMITE_MUNICIPIO:
            raise ValidationError("O recorte de municípios excede o limite de exportação. Refine os filtros.")
    return resultado
