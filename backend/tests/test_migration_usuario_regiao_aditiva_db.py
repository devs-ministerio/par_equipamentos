"""DDL real da tabela de UFs por técnico, exclusivamente em bancos descartáveis."""

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from alembic import command
from tests.test_cadeia_migrations_recuperacao_db import banco_migrations as banco_migrations

ANTERIOR = "d9e0f1a2b3c4"
NOVA = "e1f2a3b4c5d6"
TABELA = "usuario_regiao_monitoramento"


def preparar(banco):
    conexao, config = banco
    command.upgrade(config, ANTERIOR)
    usuario = conexao.scalar(
        text(
            'INSERT INTO "user" (email, name, password_hash, role) '
            "VALUES ('tecnico@example.com', 'Técnico', 'x', 'colaborador') RETURNING id"
        )
    )
    conexao.commit()
    command.upgrade(config, NOVA)
    return conexao, config, usuario


def test_sobe_cria_tabela_com_pk_composta_e_fk_em_cascata(banco_migrations):
    conexao, _, _ = preparar(banco_migrations)
    inspetor = inspect(conexao)
    assert TABELA in inspetor.get_table_names()
    assert inspetor.get_pk_constraint(TABELA)["constrained_columns"] == ["usuario_id", "uf"]
    fk = inspetor.get_foreign_keys(TABELA)[0]
    assert fk["referred_table"] == "user"
    assert fk["options"]["ondelete"] == "CASCADE"


def test_pk_composta_rejeita_uf_repetida_e_exclusao_do_usuario_leva_as_ufs(banco_migrations):
    conexao, _, usuario = preparar(banco_migrations)
    sql = text(f"INSERT INTO {TABELA} (usuario_id, uf) VALUES (:u, :uf)")
    conexao.execute(sql, {"u": usuario, "uf": "MG"})
    conexao.execute(sql, {"u": usuario, "uf": "RS"})
    with pytest.raises(IntegrityError) as erro:
        with conexao.begin_nested():
            conexao.execute(sql, {"u": usuario, "uf": "MG"})
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23505"
    conexao.execute(text('DELETE FROM "user" WHERE id=:u'), {"u": usuario})
    assert conexao.scalar(text(f"SELECT count(*) FROM {TABELA}")) == 0
    conexao.rollback()


def test_desce_remove_a_tabela_sem_tocar_usuario_e_repetir_sobe_e_idempotente(banco_migrations):
    conexao, config, usuario = preparar(banco_migrations)
    conexao.commit()
    command.downgrade(config, ANTERIOR)
    assert TABELA not in inspect(conexao).get_table_names()
    assert conexao.scalar(text('SELECT count(*) FROM "user" WHERE id=:u'), {"u": usuario}) == 1
    conexao.commit()
    command.upgrade(config, NOVA)
    assert TABELA in inspect(conexao).get_table_names()
    assert conexao.scalar(text("SELECT version_num FROM alembic_version")) == NOVA
    conexao.commit()
    command.upgrade(config, NOVA)
    assert conexao.scalar(text("SELECT version_num FROM alembic_version")) == NOVA
