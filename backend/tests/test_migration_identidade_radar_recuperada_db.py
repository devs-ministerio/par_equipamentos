"""Identidade SICONV: migration recuperada em quarentena, sem dado real."""

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
def identidade_migration():
    validar_url_banco(engine.url.render_as_string(hide_password=False), teste=True)
    prefixo = "pytest_identidade_radar_"
    schema = prefixo + uuid4().hex
    arquivo = Path(__file__).resolve().parents[1] / "alembic/recuperados/a1c2d3e4f5b6_numero_convenio_alfanumerico.py"
    migration = runpy.run_path(str(arquivo))
    with engine.connect() as conn:
        try:
            conn.execute(CreateSchema(schema))
            conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            conn.execute(
                text("""
                CREATE TABLE candidato_legado (
                    numero text NOT NULL PRIMARY KEY, id_proposta text NOT NULL,
                    CONSTRAINT ck_candidato_legado_identidade
                    CHECK (numero ~ '^[0-9]+$' AND id_proposta ~ '^[0-9]+$')
                )
            """)
            )
            conn.execute(text("INSERT INTO candidato_legado VALUES ('999001', '111001')"))
            with Operations.context(MigrationContext.configure(conn)):
                migration["upgrade"]()
                yield conn, migration
        finally:
            conn.rollback()
            # O schema e as linhas sintéticas foram criados na mesma transação.
            # Em rollback já não existem; IF EXISTS evita afetar qualquer outro.
            assert schema.startswith(prefixo) and len(schema) == len(prefixo) + 32
            conn.execute(DropSchema(schema, cascade=True, if_exists=True))
            conn.commit()


def inserir(conn, numero, proposta="111002"):
    conn.execute(
        text("INSERT INTO candidato_legado VALUES (:numero, :proposta)"), {"numero": numero, "proposta": proposta}
    )


def test_expansao_preserva_numero_original_e_aceita_alfanumerico(identidade_migration):
    conn, _ = identidade_migration
    inserir(conn, "999002A")
    assert list(conn.scalars(text("SELECT numero FROM candidato_legado ORDER BY numero"))) == ["999001", "999002A"]


@pytest.mark.parametrize(
    "numero,proposta",
    [("999002a", "111002"), ("999 002", "111002"), ("999/002", "111002"), ("", "111002"), ("999002", "111A")],
)
def test_identidade_invalida_rejeitada_no_banco(identidade_migration, numero, proposta):
    conn, _ = identidade_migration
    with pytest.raises(IntegrityError) as erro, conn.begin_nested():
        inserir(conn, numero, proposta)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.diag.constraint_name == "ck_candidato_legado_identidade"
    assert conn.scalar(text("SELECT count(*) FROM candidato_legado")) == 1


def test_down_com_alfanumerico_bloqueia_sem_remover_constraint_ou_linhas(identidade_migration):
    conn, migration = identidade_migration
    inserir(conn, "999002A")
    with pytest.raises(RuntimeError, match="Rollback bloqueado"):
        migration["downgrade"]()
    inserir(conn, "999003B")
    assert conn.scalar(text("SELECT count(*) FROM candidato_legado")) == 3


def test_down_com_numericos_preserva_historico_e_restringe_novamente(identidade_migration):
    conn, migration = identidade_migration
    migration["downgrade"]()
    assert conn.scalar(text("SELECT numero FROM candidato_legado")) == "999001"
    with pytest.raises(IntegrityError), conn.begin_nested():
        inserir(conn, "999002A")
    migration["upgrade"]()
    inserir(conn, "999002A")
