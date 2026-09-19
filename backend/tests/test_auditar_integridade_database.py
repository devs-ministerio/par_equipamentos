from __future__ import annotations

import pytest

from scripts import auditar_integridade_database as auditoria


def test_auditoria_exige_test_database_url(monkeypatch):
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)

    with pytest.raises(SystemExit) as exc:
        auditoria._configure_database_url()

    assert "TEST_DATABASE_URL" in str(exc.value)


def test_auditoria_recusa_banco_sem_nome_de_teste(monkeypatch):
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+psycopg://user:pass@localhost:5432/producao")

    with pytest.raises(SystemExit) as exc:
        auditoria._configure_database_url()

    assert "test" in str(exc.value)


def test_auditoria_publica_checks_com_nomes_unicos():
    nomes = [check.name for check in auditoria.CHECKS]

    assert len(nomes) == len(set(nomes))
