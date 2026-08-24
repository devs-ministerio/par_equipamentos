"""Wrapper comum pros scripts scripts/run_pipeline_*.py -- garante que uma
falha (API externa fora do ar mesmo apos o retry, erro de dado inesperado,
etc.) fica registrada no banco, nao só no stdout de quem rodou.

Nao usa ExecutionAlert pra isso: ExecutionAlert.execution_id e NOT NULL,
mas as etapas mais propensas a falhar (api_demas/api_sidra/api_elasticnes)
rodam ANTES da Execution ser criada (so criada no passo final, depois que
todo o dado ja foi buscado) -- nao ha execution_id pra anexar o alerta
ainda. Usa AuditLog (entity_id opcional) em vez disso, que ja existe pra
exatamente esse tipo de evento sem uma entidade-dona obrigatoria.

Sempre relanca a excecao depois de registrar -- quem dispara o script
(cron, GitHub Actions, humano) precisa do exit code != 0 pra saber que
falhou, o registro no banco e adicional, nao substitui isso.
"""
from __future__ import annotations

import traceback
from typing import Callable

from app.audit import log_action
from app.db.base import SessionLocal


def executar_com_registro_de_falha(nome_pipeline: str, run: Callable[[], None]) -> None:
    try:
        run()
    except Exception as exc:
        db = SessionLocal()
        try:
            log_action(
                db,
                user_id=None,  # execucao automatica/manual via CLI, sem usuario autenticado (Fase 1)
                entity_name="pipeline_execution",
                entity_id=None,
                action="failed",
                details={
                    "pipeline": nome_pipeline,
                    "erro": str(exc),
                    "traceback": traceback.format_exc(),
                },
            )
            db.commit()
        finally:
            db.close()
        raise
