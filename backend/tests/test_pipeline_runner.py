"""app/pipeline/runner.py -- garante que uma falha do pipeline fica
registrada em AuditLog (nao so no stdout) e que a excecao original ainda
sobe (exit code != 0 pro cron/GitHub Actions saber que falhou)."""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import AuditLog
from app.pipeline.runner import executar_com_registro_de_falha


def test_falha_e_registrada_sem_mensagem_ou_traceback_e_excecao_sobe():
    def _run_que_falha():
        raise RuntimeError("token=segredo-nao-auditavel")

    with pytest.raises(RuntimeError, match="segredo-nao-auditavel"):
        executar_com_registro_de_falha("__TESTE__", _run_que_falha)

    db = SessionLocal()
    try:
        registro = db.execute(
            select(AuditLog)
            .where(AuditLog.entity_name == "pipeline_execution", AuditLog.action == "failed")
            .order_by(AuditLog.id.desc())
            .limit(1)
        ).scalar_one()
        assert registro.details is not None
        assert registro.details["pipeline"] == "__TESTE__"
        assert registro.details["error_type"] == "RuntimeError"
        assert "segredo-nao-auditavel" not in str(registro.details)
        assert "traceback" not in registro.details
    finally:
        # log_action de propósito commita sozinho (via executar_com_registro_de_falha,
        # nao pela sessao deste teste) -- limpa explicitamente pra nao poluir
        # o audit_log real com dado de teste.
        db.delete(registro)
        db.commit()
        db.close()


def test_sucesso_nao_grava_nada_em_audit_log():
    def _run_que_funciona():
        pass

    db = SessionLocal()
    antes = db.execute(select(AuditLog.id)).scalars().all()
    db.close()

    executar_com_registro_de_falha("__TESTE__", _run_que_funciona)

    db = SessionLocal()
    try:
        depois = db.execute(select(AuditLog.id)).scalars().all()
        assert depois == antes
    finally:
        db.close()
