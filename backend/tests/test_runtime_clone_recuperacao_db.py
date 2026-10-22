"""Runtime criado só no banco descartável: TCP real, DML e negação de DDL."""

import secrets
from contextlib import contextmanager

import pytest
from argon2 import PasswordHasher
from psycopg import Error as DatabaseDriverError
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.pool import NullPool

from alembic import command
from scripts.configuracao_local_recuperacao import cadastrar_contas_locais, gerar_senhas_locais
from scripts.integridade_recuperacao import integridade_tabelas
from scripts.neutralizar_acesso_sintetico import neutralizar_acesso_sintetico
from scripts.runtime_clone_recuperacao import _provisionar_na_transacao, validar_runtime_efetivo
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel


@contextmanager
def copia_runtime_descartavel():
    with banco_descartavel() as (conn, config):
        command.upgrade(config, "b7f35c806e4a")
        nome = conn.engine.url.database
        role = "sigeo_test_runtime_" + nome.removeprefix("sigeo_test_migrations_")
        conn.execute(text(f'REVOKE ALL ON DATABASE "{nome}" FROM PUBLIC'))
        bootstrap = integridade_tabelas(conn)
        conn.commit()
        neutralizar_acesso_sintetico(destino=conn, esperado=bootstrap)
        try:
            yield conn, role
        finally:
            conn.rollback()
            # A role foi criada exclusivamente para este banco de UUID.
            # DROP OWNED só aqui, antes de o banco descartável ser removido.
            if conn.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:role)"), {"role": role}):
                conn.execute(text(f'DROP OWNED BY "{role}"'))
                conn.execute(text(f'DROP ROLE "{role}"'))
            conn.commit()


@pytest.fixture
def copia_runtime():
    with copia_runtime_descartavel() as copia:
        yield copia


def test_tcp_runtime_dml_funciona_sem_poder_ddl_ou_reescrever_auditoria(copia_runtime):
    conn, role = copia_runtime
    senha = secrets.token_urlsafe(32)
    senhas = gerar_senhas_locais()
    with conn.begin():
        _provisionar_na_transacao(conn, nome_role=role, senha=senha)
        cadastrar_contas_locais(conn, senhas)
    runtime_engine = create_engine(conn.engine.url.set(username=role, password=senha), poolclass=NullPool)
    try:
        with runtime_engine.connect() as runtime:
            validar_runtime_efetivo(runtime, role)
            assert runtime.scalar(text("SELECT session_user=current_user")) is True
            linhas = runtime.execute(
                text("SELECT email,password_hash,role FROM public.\"user\" WHERE status='active'")
            ).all()
            assert len(linhas) == 4
            for email, hash_senha, papel in linhas:
                assert email == papel + ".homologacao@example.com"
                assert PasswordHasher().verify(hash_senha, senhas[papel].get_secret_value())
            runtime.execute(text("INSERT INTO public.audit_log(entity_name,action) VALUES ('ensaio_runtime','insert')"))
            for comando in (
                "CREATE TABLE public.ensaio_proibido(id integer)",
                "CREATE TEMP TABLE ensaio_proibido(id integer)",
                "UPDATE public.alembic_version SET version_num=version_num",
                "DELETE FROM public.audit_log WHERE entity_name='ensaio_runtime'",
                "TRUNCATE public.audit_log",
            ):
                with pytest.raises(DBAPIError) as erro, runtime.begin_nested():
                    runtime.execute(text(comando))
                assert isinstance(erro.value.orig, DatabaseDriverError)
                assert erro.value.orig.sqlstate == "42501"
            runtime.rollback()
    finally:
        runtime_engine.dispose()


def test_role_e_contas_sao_revertidas_juntas(copia_runtime):
    conn, role = copia_runtime

    class ReverterEnsaio(Exception):
        pass

    with pytest.raises(ReverterEnsaio), conn.begin():
        _provisionar_na_transacao(conn, nome_role=role, senha=secrets.token_urlsafe(32))
        cadastrar_contas_locais(conn, gerar_senhas_locais())
        raise ReverterEnsaio
    assert conn.scalar(text("SELECT count(*) FROM pg_roles WHERE rolname=:role"), {"role": role}) == 0
    assert conn.scalar(text("SELECT count(*) FROM public.\"user\" WHERE status='active'")) == 0


def test_runtime_existente_nao_tem_senha_ou_grants_sobrescritos(copia_runtime):
    conn, role = copia_runtime
    with conn.begin():
        _provisionar_na_transacao(conn, nome_role=role, senha=secrets.token_urlsafe(32))
    with pytest.raises(ValueError, match="privada|já existe"), conn.begin():
        _provisionar_na_transacao(conn, nome_role=role, senha=secrets.token_urlsafe(32))
