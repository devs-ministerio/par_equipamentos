"""Acesso a dados de Execution/Competency -- extraído da triplicação idêntica
que existia em app/routers/{macro_coverage,equipment_offer,municipality_coverage}.py
(incidente 2026-09-25, ver docs/arquitetura -- resolver "execução mais
recente" só por Execution.started_at deixava um dado sintético/avulso com
started_at recente e status=published assumir o lugar da execução real de
produção). Função solta com `db: Session` posicional, mesmo contrato de
app/repositories/monitoramento.py.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Competency, Execution


def obter_execucao_publicada_mais_recente(db: Session, equipment_family: str | None) -> int | None:
    """Só considera a execução que É a publicada da sua competência
    (Competency.published_execution_id == Execution.id) -- o mesmo ponteiro que
    os pipelines (run_pipeline_*.py) já mantêm atualizado a cada rodada. Isola
    dado sintético/avulso (ex. seed de dev) que nunca passa por esse ponteiro,
    mesmo que tenha status=published e started_at recente."""
    stmt = (
        select(Execution.id)
        .join(Competency, Execution.competency_id == Competency.id)
        .where(Competency.published_execution_id == Execution.id)
        .order_by(Execution.started_at.desc())
        .limit(1)
    )
    if equipment_family:
        stmt = stmt.where(Competency.equipment_family == equipment_family)
    return db.execute(stmt).scalar_one_or_none()
