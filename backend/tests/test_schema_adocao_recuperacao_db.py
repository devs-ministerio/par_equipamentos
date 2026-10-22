"""Catálogo e ACL reais antes do adaptador aceitar qualquer cópia."""

import pytest
from sqlalchemy import text

from alembic import command
from scripts.adotar_clone_recuperacao import _validar_destino_privado
from scripts.integridade_recuperacao import validar_conexao_sintetica
from scripts.schema_adocao_recuperacao import validar_schema_adocao
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel


def test_catalogos_migrados_iguais_e_tipo_diferente_bloqueado():
    with banco_descartavel() as (a, ca), banco_descartavel() as (b, cb):
        command.upgrade(ca, "b7f35c806e4a")
        command.upgrade(cb, "b7f35c806e4a")
        # COPY enumera colunas por nome: ordem física não altera o contrato.
        a.execute(text("CREATE TABLE ordem_teste (id bigint PRIMARY KEY,a text,b integer)"))
        b.execute(text("CREATE TABLE ordem_teste (id bigint PRIMARY KEY,b integer,a text)"))
        validar_schema_adocao(a, b)
        b.execute(text("ALTER TABLE convenio ALTER COLUMN convenente_nome TYPE varchar(1000)"))
        with pytest.raises(ValueError, match="Schema"):
            validar_schema_adocao(a, b)


def test_corpo_de_funcao_mudado_bloqueia_mesmo_com_mesma_assinatura():
    with banco_descartavel() as (a, ca), banco_descartavel() as (b, cb):
        command.upgrade(ca, "b7f35c806e4a")
        command.upgrade(cb, "b7f35c806e4a")
        for conn in (a, b):
            conn.execute(
                text(
                    "CREATE FUNCTION comparacao_teste() RETURNS text LANGUAGE plpgsql AS $$ BEGIN RETURN 'A B'; END $$"
                )
            )
        validar_schema_adocao(a, b)
        b.execute(
            text(
                "CREATE OR REPLACE FUNCTION comparacao_teste() RETURNS text LANGUAGE plpgsql AS $$ BEGIN RETURN 'A  B'; END $$"
            )
        )
        with pytest.raises(ValueError, match="funções"):
            validar_schema_adocao(a, b)


def test_check_nao_equivalente_bloqueia():
    with banco_descartavel() as (a, ca), banco_descartavel() as (b, cb):
        command.upgrade(ca, "b7f35c806e4a")
        command.upgrade(cb, "b7f35c806e4a")
        a.execute(text("ALTER TABLE convenio ADD CONSTRAINT ck_teste_numero CHECK (numero <> 'A')"))
        b.execute(text("ALTER TABLE convenio ADD CONSTRAINT ck_teste_numero CHECK (numero <> 'B')"))
        with pytest.raises(ValueError, match="CHECK"):
            validar_schema_adocao(a, b)


def test_destino_exige_acl_privada_e_nenhum_outro_cliente():
    with banco_descartavel() as (conn, config):
        command.upgrade(config, "b7f35c806e4a")
        with pytest.raises(ValueError, match="privado"):
            _validar_destino_privado(conn)
        nome = validar_conexao_sintetica(conn)
        conn.execute(text(f'REVOKE ALL ON DATABASE "{nome}" FROM PUBLIC'))
        conn.commit()
        _validar_destino_privado(conn)
        conn.commit()
        with conn.engine.connect() as outro:
            outro.execute(text("SELECT 1"))
            with pytest.raises(ValueError, match="outros clientes"):
                _validar_destino_privado(conn)
