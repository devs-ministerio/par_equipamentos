"""Regressao do bug encontrado em 2026-08-21 rodando o pipeline pela
primeira vez contra uma competencia ja existente nesta base: o UPDATE de
`competency.published_execution_id` pra apontar pra execucao nova nao
tinha `db.flush()` antes do DELETE (via Core, que nao dispara autoflush
igual uma query ORM) da execucao antiga -- a FK ainda apontava pra ela e
o DELETE quebrava com ForeignKeyViolation. Reproduz o mesmo padrao
(2 execucoes na mesma competencia, published_execution_id trocado, delete
da antiga) direto contra o banco configurado, sem rodar o pipeline
inteiro (que depende das 3 APIs externas).
"""

from __future__ import annotations

from sqlalchemy import delete

from app.db.base import SessionLocal
from app.db.models import Competency, Execution, ExecutionMode, ExecutionStatus


def test_troca_published_execution_id_antes_de_deletar_a_antiga():
    db = SessionLocal()
    try:
        competency = Competency(label="__teste_dedup__")
        db.add(competency)
        db.flush()

        antiga = Execution(
            competency_id=competency.id,
            version=1,
            mode=ExecutionMode.manual,
            status=ExecutionStatus.published,
            config_chave_macrorregiao="ibge_municipio",
            config_denominador_oferta="qt_existente_sus",
            active_sources={},
        )
        db.add(antiga)
        db.flush()
        competency.published_execution_id = antiga.id
        db.flush()

        nova = Execution(
            competency_id=competency.id,
            version=2,
            mode=ExecutionMode.manual,
            status=ExecutionStatus.published,
            config_chave_macrorregiao="ibge_municipio",
            config_denominador_oferta="qt_existente_sus",
            active_sources={},
        )
        db.add(nova)
        db.flush()

        # exatamente o padrao de run_pipeline_tomografo.py: troca o ponteiro
        # e SO DEPOIS de um flush explicito deleta a execucao antiga.
        competency.published_execution_id = nova.id
        db.flush()
        db.execute(delete(Execution).where(Execution.id == antiga.id))  # nao pode levantar ForeignKeyViolation

        db.rollback()  # nunca commita dado de teste
    finally:
        db.close()
