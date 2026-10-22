"""Fixture DML autossuficiente contra PostgreSQL real, sem runtime preexistente."""

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from tests.runtime_radar_fixture import nome_runtime_sintetico, sessao_runtime_radar
from tests.test_notificacoes_destinatarios_db import matriz as matriz


def destino(matriz):
    dono, *_ = matriz
    bind = dono.get_bind()
    schema = bind.get_execution_options()["schema_translate_map"][None]
    dono.commit()
    return dono, bind, schema, nome_runtime_sintetico(schema)


def test_cria_role_uuid_restrita_e_remove_apos_uso(matriz):
    # Arrange
    dono, bind, schema, role = destino(matriz)
    assert dono.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:role)"), {"role": role}) is False
    dono.commit()
    # Act / Assert: não pode autenticar por TCP nem ler o public da aplicação.
    with sessao_runtime_radar(bind, schema) as db:
        assert db.scalar(text("SELECT current_user")) == role
        flags = db.execute(
            text("""SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,
            rolbypassrls,rolinherit,rolcanlogin FROM pg_roles WHERE rolname=current_user""")
        ).one()
        assert tuple(flags) == (False,) * 7
        assert (
            db.scalar(
                text(
                    "SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)"
                )
            )
            == 0
        )
        with pytest.raises(DBAPIError) as erro, db.begin_nested():
            db.execute(text("SELECT numero FROM public.convenio LIMIT 1"))
        assert isinstance(erro.value.orig, DatabaseDriverError) and erro.value.orig.sqlstate == "42501"
    assert dono.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:role)"), {"role": role}) is False


def test_falha_do_teste_nao_deixa_role_ou_pool_alterado(matriz):
    # Arrange
    dono, bind, schema, role = destino(matriz)

    class FalhaSintetica(Exception):
        pass

    # Act
    with pytest.raises(FalhaSintetica), sessao_runtime_radar(bind, schema) as db:
        assert db.scalar(text("SELECT current_user")) == role
        raise FalhaSintetica
    # Assert
    assert dono.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:role)"), {"role": role}) is False
    with bind.connect() as conn:
        assert conn.scalar(text("SELECT current_user=session_user")) is True


def test_role_preexistente_nao_recebe_grants_nem_e_removida(matriz):
    # Arrange: role criada exclusivamente por este teste para simular colisão.
    dono, bind, schema, role = destino(matriz)
    dono.execute(text(f'CREATE ROLE "{role}" NOLOGIN'))
    oid = dono.scalar(text("SELECT oid FROM pg_roles WHERE rolname=:role"), {"role": role})
    dono.commit()
    try:
        # Act / Assert
        with pytest.raises(ValueError, match="já existe"), sessao_runtime_radar(bind, schema):
            pytest.fail("Colisão deve interromper o ensaio")
        assert dono.scalar(text("SELECT oid FROM pg_roles WHERE rolname=:role"), {"role": role}) == oid
        assert (
            dono.scalar(text("SELECT has_schema_privilege(:role,:schema,'USAGE')"), {"role": role, "schema": schema})
            is False
        )
    finally:
        dono.rollback()
        dono.execute(text(f'DROP ROLE "{role}"'))
        dono.commit()
