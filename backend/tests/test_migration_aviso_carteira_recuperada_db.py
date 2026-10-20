"""Enum histórico em quarentena: expansão e reversão preservadora isoladas."""

import runpy
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text
from sqlalchemy.schema import CreateSchema, DropSchema

from app.db.base import engine
from scripts.homologacao_local import validar_url_banco


@pytest.fixture(
    params=[
        ("f0a1b2c3d4e5_aviso_aprovacao_carteira.py", "aprovacao_carteira"),
        ("e6a7b8c9d0f1_aviso_descoberta_radar.py", "convenio_descoberto"),
    ]
)
def aviso_migration(request):
    validar_url_banco(engine.url.render_as_string(hide_password=False), teste=True)
    prefixo = "pytest_enum_radar_"
    schema = prefixo + uuid4().hex
    nome, literal = request.param
    arquivo = Path(__file__).resolve().parents[1] / "alembic/recuperados" / nome
    migration = runpy.run_path(str(arquivo))
    with engine.connect() as conn:
        try:
            conn.execute(CreateSchema(schema))
            conn.execute(text(f'SET search_path TO "{schema}"'))
            conn.execute(text("CREATE TYPE notificacao_tipo AS ENUM ('atualizacao_api')"))
            conn.execute(text("CREATE TABLE notificacao (id bigint PRIMARY KEY, tipo notificacao_tipo NOT NULL)"))
            conn.execute(text("INSERT INTO notificacao VALUES (1, 'atualizacao_api')"))
            conn.commit()
            with Operations.context(MigrationContext.configure(conn)):
                migration["upgrade"]()
                yield conn, migration, literal
        finally:
            conn.rollback()
            conn.execute(text("RESET search_path"))
            assert schema.startswith(prefixo) and len(schema) == len(prefixo) + 32
            conn.execute(DropSchema(schema, cascade=True))
            conn.commit()


def test_expansao_aceita_aviso_e_preserva_notificacao_anterior(aviso_migration):
    conn, _, literal = aviso_migration
    conn.execute(text("INSERT INTO notificacao VALUES (2, CAST(:tipo AS notificacao_tipo))"), {"tipo": literal})
    assert list(conn.execute(text("SELECT id, tipo::text FROM notificacao ORDER BY id"))) == [
        (1, "atualizacao_api"),
        (2, literal),
    ]


def test_upgrade_repetido_nao_duplica_literal(aviso_migration):
    conn, migration, literal = aviso_migration
    migration["upgrade"]()
    assert (
        conn.scalar(
            text("SELECT count(*) FROM unnest(enum_range(NULL::notificacao_tipo)) v WHERE v::text = :tipo"),
            {"tipo": literal},
        )
        == 1
    )


def test_rollback_com_aviso_bloqueia_sem_apagar_historico(aviso_migration):
    conn, migration, literal = aviso_migration
    conn.execute(text("INSERT INTO notificacao VALUES (2, CAST(:tipo AS notificacao_tipo))"), {"tipo": literal})
    conn.commit()
    with pytest.raises(RuntimeError, match="antes de reverter"):
        migration["downgrade"]()
    assert conn.scalar(text("SELECT count(*) FROM notificacao")) == 2
    assert conn.scalar(text("SELECT tipo::text FROM notificacao WHERE id = 2")) == literal


def test_rollback_sem_aviso_novo_preserva_enum_e_outros_avisos(aviso_migration):
    conn, migration, literal = aviso_migration
    migration["downgrade"]()
    assert conn.scalar(text("SELECT tipo::text FROM notificacao WHERE id = 1")) == "atualizacao_api"
    conn.execute(text("INSERT INTO notificacao VALUES (2, CAST(:tipo AS notificacao_tipo))"), {"tipo": literal})
    assert conn.scalar(text("SELECT count(*) FROM notificacao")) == 2
