"""Promoção e rollback reais, sem deixar cópia persistente criada pelo teste."""

from uuid import uuid4

import pytest
from sqlalchemy import text

from alembic import command
from app.db.base import engine
from scripts.integridade_recuperacao import integridade_tabelas
from scripts.neutralizar_acesso_sintetico import neutralizar_acesso_sintetico
from scripts.promover_clone_recuperacao import (
    _promover_na_transacao,
    conferir_copia_para_promocao,
)
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel


class ReverterEnsaio(Exception):
    """Força rollback do rename e do bloqueio de conexões no teste."""


def test_destino_existente_nao_e_substituido():
    with banco_descartavel() as (origem, _), banco_descartavel() as (existente, _):
        nome, alvo = origem.engine.url.database, existente.engine.url.database
        oid_origem = origem.scalar(text("SELECT oid FROM pg_database WHERE datname=current_database()"))
        oid_existente = existente.scalar(text("SELECT oid FROM pg_database WHERE datname=current_database()"))
        with engine.connect() as admin:
            with pytest.raises(ValueError, match="já existe"), admin.begin():
                _promover_na_transacao(admin, nome=nome, oid_conferido=oid_origem, nome_destino=alvo)
            assert (
                admin.scalar(text("SELECT oid FROM pg_database WHERE datname=:nome"), {"nome": alvo}) == oid_existente
            )
            assert admin.scalar(text("SELECT oid FROM pg_database WHERE datname=:nome"), {"nome": nome}) == oid_origem


def preparar_copia(conn, config):
    command.upgrade(config, "b7f35c806e4a")
    nome = conn.engine.url.database
    conn.execute(text(f'REVOKE ALL ON DATABASE "{nome}" FROM PUBLIC'))
    bootstrap = integridade_tabelas(conn)
    conn.commit()
    neutralizar_acesso_sintetico(destino=conn, esperado=bootstrap)
    conn.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
    return nome, integridade_tabelas(conn)


def test_promocao_preserva_oid_bloqueia_conexoes_e_rollback_restaura_nome():
    with banco_descartavel() as (conn, config):
        nome, manifesto = preparar_copia(conn, config)
        oid = conferir_copia_para_promocao(conn, manifesto)
        conn.close()
        alvo = "sigeo_test_migrations_" + uuid4().hex
        with engine.connect() as admin:
            with pytest.raises(ReverterEnsaio), admin.begin():
                assert _promover_na_transacao(admin, nome=nome, oid_conferido=oid, nome_destino=alvo) == oid
                assert admin.scalar(text("SELECT datallowconn FROM pg_database WHERE oid=:oid"), {"oid": oid}) is False
                assert admin.scalar(text("SELECT datname FROM pg_database WHERE oid=:oid"), {"oid": oid}) == alvo
                raise ReverterEnsaio
            assert admin.scalar(text("SELECT datname FROM pg_database WHERE oid=:oid"), {"oid": oid}) == nome
            assert admin.scalar(text("SELECT datallowconn FROM pg_database WHERE oid=:oid"), {"oid": oid}) is True


def test_conferencia_rejeita_manifesto_alterado_e_usuario_ativo():
    with banco_descartavel() as (conn, config):
        nome, manifesto = preparar_copia(conn, config)
        with pytest.raises(ValueError, match="Manifesto"):
            conferir_copia_para_promocao(conn, {})
        conn.rollback()
        conn.execution_options(isolation_level="READ COMMITTED", postgresql_readonly=False)
        conn.execute(text("UPDATE public.\"user\" SET status='active'"))
        conn.commit()
        conn.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
        alterado = integridade_tabelas(conn)
        assert alterado != manifesto
        with pytest.raises(ValueError, match="identidades habilitadas"):
            conferir_copia_para_promocao(conn, alterado)


def test_promocao_recusa_cliente_conectado_e_oid_divergente():
    with banco_descartavel() as (conn, config):
        nome, manifesto = preparar_copia(conn, config)
        oid = conferir_copia_para_promocao(conn, manifesto)
        alvo = "sigeo_test_migrations_" + uuid4().hex
        with engine.connect() as admin:
            with pytest.raises(ValueError), admin.begin():
                _promover_na_transacao(admin, nome=nome, oid_conferido=oid, nome_destino=alvo)
            conn.close()
            with pytest.raises(ValueError), admin.begin():
                _promover_na_transacao(admin, nome=nome, oid_conferido=oid + 1, nome_destino=alvo)
            assert admin.scalar(text("SELECT datname FROM pg_database WHERE oid=:oid"), {"oid": oid}) == nome


@pytest.mark.parametrize("risco", ["convite", "sessao"])
def test_conferencia_recusa_convites_e_sessoes_mesmo_expirados(risco):
    with banco_descartavel() as (conn, config):
        preparar_copia(conn, config)
        conn.rollback()
        conn.execution_options(isolation_level="READ COMMITTED", postgresql_readonly=False)
        if risco == "convite":
            conn.execute(
                text(
                    "UPDATE public.\"user\" SET activation_token_hash='sintetico-' || id::text, activation_expires_at=now()-interval '1 day'"
                )
            )
        else:
            conn.execute(
                text(
                    "INSERT INTO refresh_token(user_id,token_hash,expires_at) SELECT id,'sintetico',now()-interval '1 day' FROM public.\"user\" LIMIT 1"
                )
            )
        conn.commit()
        conn.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
        manifesto = integridade_tabelas(conn)
        with pytest.raises(ValueError, match="convites|sessões"):
            conferir_copia_para_promocao(conn, manifesto)
