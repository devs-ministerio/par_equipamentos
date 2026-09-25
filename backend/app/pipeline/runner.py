"""Wrapper comum pros scripts scripts/run_pipeline_*.py -- garante que uma
falha (API externa fora do ar mesmo apos o retry, erro de dado inesperado,
etc.) fica registrada no banco, nao só no stdout de quem rodou.

Usa AuditLog (entity_id opcional) pra isso -- ja existe pra exatamente
esse tipo de evento sem uma entidade-dona obrigatoria. `ExecutionAlert`
(que exigia execution_id NOT NULL, inviável nas etapas mais propensas a
falhar -- api_demas/api_sidra/api_elasticnes rodam ANTES da Execution ser
criada) foi removida por falta de uso (Plan Mode fechamento final
2026-09-25, Bloco 7).

Sempre relanca a excecao depois de registrar -- quem dispara o script
(cron, GitHub Actions, humano) precisa do exit code != 0 pra saber que
falhou, o registro no banco e adicional, nao substitui isso.
"""

from __future__ import annotations

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
                    # AuditLog é evidência operacional de longa duração, não
                    # cofre de diagnóstico. Mensagem e traceback podem conter
                    # URL, parâmetros ou respostas de integrações; o tipo é
                    # suficiente para triagem e o processo ainda relança a
                    # exceção ao executor autorizado.
                    "error_type": type(exc).__name__,
                },
            )
            db.commit()
        finally:
            db.close()
        raise
