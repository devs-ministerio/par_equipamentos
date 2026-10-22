"""Cadeia disponível em banco vazio descartável; não stamp do clone sobrevivente."""

from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import NullPool

from alembic import command
from app.db.base import engine
from scripts.homologacao_local import validar_url_banco


@contextmanager
def banco_descartavel():
    validar_url_banco(engine.url.render_as_string(hide_password=False), teste=True)
    prefixo = "sigeo_test_migrations_"
    nome = prefixo + uuid4().hex
    assert len(nome) < 63 and all(c in "0123456789abcdef" for c in nome[len(prefixo) :])
    alvo = None
    criado = False
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as admin:
        assert admin.scalar(text("SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user"))
        try:
            # Identificador gerado, não fornecido por usuário. Nenhum TEMPLATE
            # de clone: o banco começa vazio e recebe migrations reais.
            admin.execute(text(f'CREATE DATABASE "{nome}"'))
            criado = True
            alvo = create_engine(engine.url.set(database=nome), poolclass=NullPool)
            with alvo.connect() as conexao:
                assert conexao.scalar(text("SELECT current_database()")) == nome
                conexao.commit()
                config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
                config.attributes["connection"] = conexao
                yield conexao, config
        finally:
            if alvo is not None:
                alvo.dispose()
            if criado:
                assert nome.startswith(prefixo) and len(nome) == len(prefixo) + 32
                # Todas as conexões deste ensaio já fecharam. Não terminar
                # sessões alheias nem remover qualquer banco por glob/prefixo.
                admin.execute(text(f'DROP DATABASE "{nome}"'))


@pytest.fixture
def banco_migrations():
    with banco_descartavel() as banco:
        yield banco


def test_cadeia_disponivel_upgrade_real_e_reversao_da_ultima_revisao(banco_migrations):
    conexao, config = banco_migrations
    command.upgrade(config, "b5c6d7e8f9a0")
    assert conexao.scalar(text("SELECT version_num FROM alembic_version")) == "b5c6d7e8f9a0"
    tabelas = set(inspect(conexao).get_table_names())
    assert {"user", "convenio", "fonte_captura", "candidato_legado", "candidato_legado_decisao"} <= tabelas
    # A cadeia antiga chega à triagem, não aos módulos ainda ausentes.
    assert "candidato_legado_recaptura" not in tabelas
    assert "candidato_legado_componente" not in tabelas
    colunas = {c["name"] for c in inspect(conexao).get_columns("candidato_legado_decisao")}
    assert "recaptura_id" not in colunas and "convenio_id" not in colunas
    assert conexao.scalar(text("SELECT count(*) FROM candidato_legado_decisao")) == 0
    command.downgrade(config, "a4b5c6d7e8f9")
    assert "candidato_legado_decisao" not in inspect(conexao).get_table_names()
    command.upgrade(config, "b5c6d7e8f9a0")
    assert "candidato_legado_decisao" in inspect(conexao).get_table_names()


def estrutura_das_tabelas_removidas(conexao):
    inspetor = inspect(conexao)
    return {
        tabela: {
            "colunas": [{**coluna, "type": str(coluna["type"])} for coluna in inspetor.get_columns(tabela)],
            "fks": inspetor.get_foreign_keys(tabela),
            "unicas": inspetor.get_unique_constraints(tabela),
            "pk": inspetor.get_pk_constraint(tabela),
        }
        for tabela in ("execution_alert", "equipamento_alias")
    }


def test_rb001_reversao_restaura_estrutura_original_e_permite_reaplicar(banco_migrations):
    # Arrange: schema real imediatamente anterior à remoção das tabelas.
    conexao, config = banco_migrations
    command.upgrade(config, "488a535a0b5e")
    estrutura_original = estrutura_das_tabelas_removidas(conexao)
    enums_originais = inspect(conexao).get_enums()
    # Act / Assert: duas passagens provam que o enum é criado uma única vez
    # e a FK mantém o nome esperado pelo downgrade c9f1a4d7e602.
    for _ in range(2):
        command.upgrade(config, "9c2e4f7a1d38")
        assert "execution_alert" not in inspect(conexao).get_table_names()
        assert "equipamento_alias" not in inspect(conexao).get_table_names()
        assert "alert_type" not in {enum["name"] for enum in inspect(conexao).get_enums()}
        command.downgrade(config, "488a535a0b5e")
        assert estrutura_das_tabelas_removidas(conexao) == estrutura_original
        assert inspect(conexao).get_enums() == enums_originais
        assert conexao.scalar(text("SELECT version_num FROM alembic_version")) == "488a535a0b5e"


@pytest.mark.parametrize("revisao", ["b5c6d7e8f9a0", "head"])
def test_reversao_da_cadeia_disponivel_ate_base_em_banco_sem_historico(banco_migrations, revisao):
    # Arrange: cadeia real em banco vazio, sem dados de usuários.
    conexao, config = banco_migrations
    command.upgrade(config, revisao)
    tabelas_originais = set(inspect(conexao).get_table_names())
    enums_originais = inspect(conexao).get_enums()
    revisao_original = conexao.scalar(text("SELECT version_num FROM alembic_version"))
    # Leituras da verificação abrem transação implícita. Encerrá-la antes
    # de a cadeia atravessar migrations com DDL CONCURRENTLY/autocommit.
    conexao.commit()
    # Act / Assert: reverter e reconstruir sem limpeza manual ou stamp.
    command.downgrade(config, "base")
    assert conexao.scalar(text("SELECT count(*) FROM alembic_version")) == 0
    assert set(inspect(conexao).get_table_names()) == {"alembic_version"}
    assert inspect(conexao).get_enums() == []
    conexao.commit()
    command.upgrade(config, revisao)
    assert conexao.scalar(text("SELECT version_num FROM alembic_version")) == revisao_original
    assert set(inspect(conexao).get_table_names()) == tabelas_originais
    assert inspect(conexao).get_enums() == enums_originais


@pytest.mark.parametrize(
    "anterior,revisao",
    [("base", "92fe48aa5b7b"), ("d1e2f3a4b5c6", "c214b6dc6a4a")],
)
def test_reversao_remove_apenas_enums_da_propria_revisao(banco_migrations, anterior, revisao):
    # Arrange: tipo alheio às migrations, no mesmo banco descartável.
    conexao, config = banco_migrations
    command.upgrade(config, anterior)
    conexao.execute(text("CREATE TYPE sigeo_enum_alheio AS ENUM ('preservar')"))
    enums_anteriores = inspect(conexao).get_enums()
    conexao.commit()
    # Act: cruzar a revisão sem remover objetos de outra responsabilidade.
    command.upgrade(config, revisao)
    command.downgrade(config, anterior)
    # Assert: nenhum tipo órfão e nenhum tipo externo removido.
    assert inspect(conexao).get_enums() == enums_anteriores
