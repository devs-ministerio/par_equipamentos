"""Leitura de macro_coverage (Fase Unificacao) -- so GET. A escrita e feita
por scripts/run_pipeline_tomografo.py (Modulo 5, DEMAS+SIDRA+ElastiCNES),
nao por um endpoint ainda (execucao sob demanda via API fica pra quando o
fluxo gerar automatico/manual for retomado).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import Competency, Execution, MacroCoverage
from app.schemas import MacroCoverageRead

router = APIRouter(prefix="/macro-coverage", tags=["macro-coverage"])


def _latest_execution_id(db: Session, equipment_family: str | None) -> int | None:
    # Precisa filtrar por familia: cada Execution pertence a uma Competency
    # de UMA familia so (ver comentario em app/db/models.py:Competency), entao
    # com mais de uma familia com dado (TOMOGRAFO + RESSONANCIA) pegar so a
    # "mais recente" sem escopar por familia buscava a execucao errada --
    # ex.: RESSONANCIA seedada depois de TOMOGRAFO virava "a mais recente"
    # global, e o filtro `WHERE execution_id = <da RESSONANCIA> AND
    # equipment_family = 'TOMOGRAFO'` sempre dava 0 linhas (bug real,
    # corrigido 2026-08-21: pagina do Tomografo aparecia vazia).
    stmt = select(Execution.id).join(Competency, Execution.competency_id == Competency.id).order_by(
        Execution.started_at.desc()
    ).limit(1)
    if equipment_family:
        stmt = stmt.where(Competency.equipment_family == equipment_family)
    return db.execute(stmt).scalar_one_or_none()


def _to_read(row: MacroCoverage) -> MacroCoverageRead:
    data = MacroCoverageRead.model_validate(row)
    if row.required_qty:  # nunca divide por zero/None
        data.coverage_percentage = round((row.available_qty or 0) / row.required_qty * 100, 1)
    return data


@router.get("", response_model=list[MacroCoverageRead])
def listar_macro_coverage(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    macro_code: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[MacroCoverageRead]:
    """Lista a cobertura por macrorregiao. Sem `execution_id`, usa a execucao
    mais recente (nao precisa ter conceito de competencia publicada ainda --
    isso e Modulo 5/7, nao existe nenhuma execucao alem da de seed hoje).
    `macro_code` e opcional -- usado pelo modal de detalhe do municipio pra
    buscar so a macro dele em vez da lista inteira (~121 linhas)."""
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return []

    stmt = select(MacroCoverage).where(MacroCoverage.execution_id == exec_id)
    if equipment_family:
        stmt = stmt.where(MacroCoverage.equipment_family == equipment_family)
    if macro_code:
        stmt = stmt.where(MacroCoverage.macro_code.in_(macro_code))

    rows = db.execute(stmt).scalars().all()
    return [_to_read(r) for r in rows]
