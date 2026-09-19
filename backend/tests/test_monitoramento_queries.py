"""Regressões de query para monitoramento.

Valida contra banco real que as listagens agregadas filtram o universo de
EventoMarco/AcaoMonitoramento no SQL, sem depender de inspeção textual do
código-fonte do router.
"""
from __future__ import annotations

import re
from contextlib import contextmanager

import pytest
from sqlalchemy import event

from app.db.base import SessionLocal
from app.routers.monitoramento import listar_instrumentos, obter_resumo


@contextmanager
def capturar_sql(db):
    statements: list[str] = []

    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        statements.append(re.sub(r"\s+", " ", statement.lower()).strip())

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)


@pytest.mark.db
def test_listar_instrumentos_busca_somente_eventos_de_fase_geral():
    db = SessionLocal()
    try:
        with capturar_sql(db) as statements:
            resultado = listar_instrumentos(limit=500, db=db)

        assert resultado
        consultas_evento = [s for s in statements if " from evento_marco" in s]
        assert consultas_evento
        assert all("marco_id in" in s or "marco_id = any" in s for s in consultas_evento)
    finally:
        db.close()


@pytest.mark.db
def test_obter_resumo_agrega_acoes_no_banco_e_filtra_eventos_relevantes():
    db = SessionLocal()
    try:
        with capturar_sql(db) as statements:
            resumo = obter_resumo(db=db)

        assert resumo.total_instrumentos >= 1
        consultas_evento = [s for s in statements if " from evento_marco" in s]
        assert consultas_evento
        assert all("marco_id in" in s or "marco_id = any" in s for s in consultas_evento)
        assert any(" from acao_monitoramento" in s and "count(" in s for s in statements)
    finally:
        db.close()
