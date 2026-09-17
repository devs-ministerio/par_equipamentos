"""Protecao dos testes que encostam em banco.

Os testes de integracao deste projeto usam SQL real e alguns fazem commit
para validar comportamento de transacao/auditoria. Por isso eles so rodam
quando TEST_DATABASE_URL aponta para um banco PostgreSQL dedicado de teste.
Sem essa variavel, a suite ainda coleta os arquivos, mas pula esses modulos.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from sqlalchemy.engine import make_url


_DB_TEST_MODULES = {
    "test_competency_por_familia.py",
    "test_config_decisions.py",
    "test_equipment_totals.py",
    "test_integridade_constraints.py",
    "test_integridade_fk_cnes.py",
    "test_monitoramento.py",
    "test_monitoramento_queries.py",
    "test_municipality_coverage.py",
    "test_notificacoes.py",
    "test_pipeline_dedup.py",
    "test_pipeline_runner.py",
    "test_propostas_candidatas.py",
    "test_schema_migrations.py",
}


def _test_database_url() -> str | None:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        return None

    parsed = make_url(url)
    if parsed.get_backend_name() != "postgresql":
        pytest.exit("TEST_DATABASE_URL precisa usar PostgreSQL para validar comportamento real do banco.")

    database = (parsed.database or "").lower()
    if "test" not in database and "pytest" not in database:
        pytest.exit(
            "TEST_DATABASE_URL precisa apontar para um banco dedicado de teste "
            "(nome contendo 'test' ou 'pytest')."
        )

    return url


_TEST_DATABASE_URL = _test_database_url()
if _TEST_DATABASE_URL:
    os.environ["DATABASE_URL"] = _TEST_DATABASE_URL


def pytest_sessionstart(session: pytest.Session) -> None:
    if not _TEST_DATABASE_URL:
        return

    from scripts.seed_monitoramento import run as seed_monitoramento

    seed_monitoramento()


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    db_marker = pytest.mark.db
    if _TEST_DATABASE_URL:
        for item in items:
            path = Path(getattr(item, "path", item.fspath))
            if path.name in _DB_TEST_MODULES:
                item.add_marker(db_marker)
        return

    skip_db = pytest.mark.skip(reason="requer TEST_DATABASE_URL apontando para banco PostgreSQL de teste")
    for item in items:
        path = Path(getattr(item, "path", item.fspath))
        if path.name in _DB_TEST_MODULES:
            item.add_marker(db_marker)
            item.add_marker(skip_db)
