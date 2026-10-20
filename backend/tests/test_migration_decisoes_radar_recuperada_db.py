"""Migration histórica disponível, isolada; não valida a cadeia ausente."""

import runpy
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from psycopg import Error as DatabaseDriverError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateSchema, DropSchema

from app.db.base import engine
from scripts.homologacao_local import validar_url_banco


@pytest.fixture
def migration_radar():
    validar_url_banco(engine.url.render_as_string(hide_password=False), teste=True)
    schema = "pytest_migration_radar_" + uuid4().hex
    arquivo = Path(__file__).resolve().parents[1] / "alembic/versions/b5c6d7e8f9a0_decisoes_radar.py"
    migration = runpy.run_path(str(arquivo))
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(CreateSchema(schema))
        try:
            with conn.begin():
                # Apenas os predecessores mínimos sintéticos. Não usa public
                # nem Base.create_all para fingir execução da cadeia histórica.
                conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                conn.execute(text("CREATE TABLE candidato_legado (id bigint PRIMARY KEY)"))
                conn.execute(text('CREATE TABLE "user" (id bigint PRIMARY KEY)'))
                conn.execute(text("CREATE TABLE candidato_legado_captura (id bigint PRIMARY KEY, candidato_id bigint)"))
                conn.execute(text("INSERT INTO candidato_legado VALUES (1), (2)"))
                conn.execute(text('INSERT INTO "user" VALUES (1)'))
                conn.execute(text("INSERT INTO candidato_legado_captura VALUES (10, 1), (20, 2)"))
            with conn.begin():
                conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                with Operations.context(MigrationContext.configure(conn)):
                    migration["upgrade"]()
            with conn.begin():
                conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                with Operations.context(MigrationContext.configure(conn)):
                    yield conn, migration
        finally:
            if conn.in_transaction():
                conn.rollback()
            with conn.begin():
                assert (
                    schema.startswith("pytest_migration_radar_") and len(schema) == len("pytest_migration_radar_") + 32
                )
                conn.execute(DropSchema(schema, cascade=True))


def inserir(conn, *, captura=10, chave=None):
    return conn.scalar(
        text("""
            INSERT INTO candidato_legado_decisao
                (candidato_id, captura_id, usuario_id, chave, situacao_anterior, situacao, justificativa)
            VALUES (1, :captura, 1, :chave, 'novo', 'em_analise', 'Análise sintética') RETURNING id
        """),
        {"captura": captura, "chave": chave or uuid4()},
    )


@pytest.mark.parametrize("operacao", ["UPDATE", "DELETE"])
def test_trigger_historico_bloqueia_mutacao_sql_direta(migration_radar, operacao):
    conn, _ = migration_radar
    decisao_id = inserir(conn)
    comando = (
        "UPDATE candidato_legado_decisao SET justificativa = 'Alteração indevida' WHERE id = :id"
        if operacao == "UPDATE"
        else "DELETE FROM candidato_legado_decisao WHERE id = :id"
    )
    with pytest.raises(IntegrityError, match="imutável") as erro, conn.begin_nested():
        conn.execute(text(comando), {"id": decisao_id})
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    assert (
        conn.scalar(text("SELECT justificativa FROM candidato_legado_decisao WHERE id = :id"), {"id": decisao_id})
        == "Análise sintética"
    )
    # Append-only bloqueia mutação, não inserção de outra decisão.
    assert inserir(conn) != decisao_id


def test_migration_fk_composta_rejeita_captura_de_outro_candidato(migration_radar):
    conn, _ = migration_radar
    with pytest.raises(IntegrityError) as erro, conn.begin_nested():
        inserir(conn, captura=20)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23503"
    assert conn.scalar(text("SELECT count(*) FROM candidato_legado_decisao")) == 0


def test_migration_chave_idempotente_tem_unicidade_no_banco(migration_radar):
    conn, _ = migration_radar
    chave = uuid4()
    inserir(conn, chave=chave)
    with pytest.raises(IntegrityError) as erro, conn.begin_nested():
        inserir(conn, chave=chave)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23505"
    assert conn.scalar(text("SELECT count(*) FROM candidato_legado_decisao")) == 1


def test_up_down_up_somente_com_historico_vazio(migration_radar):
    conn, migration = migration_radar
    assert conn.scalar(text("SELECT count(*) FROM candidato_legado_decisao")) == 0
    migration["downgrade"]()
    assert conn.scalar(text("SELECT to_regclass('candidato_legado_decisao')")) is None
    assert conn.scalar(text("SELECT to_regprocedure('proteger_decisao_legado()')")) is None
    migration["upgrade"]()
    assert inserir(conn) is not None
