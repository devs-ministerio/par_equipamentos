"""Origem exata não se confunde com banco sintético nem com produção."""

from unittest.mock import Mock

import pytest
from sqlalchemy import Connection
from sqlalchemy.engine import make_url

from scripts.adotar_clone_recuperacao import adotar_clone_em_descartavel
from scripts.schema_adocao_recuperacao import _tokens_funcao


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://local@remoto.invalid/sigeo_homologacao_clone_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_homologacao_base_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_test_migrations_" + "a" * 32,
        "postgresql+psycopg://local@127.0.0.1/sigeo_homologacao_clone_20261006?options=-csearch_path=outro",
        "sqlite:///:memory:",
    ],
)
def test_origem_fora_escopo_nao_executa_sql(url):
    origem, destino = Mock(spec=Connection), Mock(spec=Connection)
    origem.engine = Mock()
    origem.engine.url = make_url(url)
    destino.in_transaction.return_value = False
    with pytest.raises(ValueError):
        adotar_clone_em_descartavel(origem=origem, destino=destino, bootstrap={})
    origem.scalar.assert_not_called()
    destino.begin.assert_not_called()


def test_normaliza_so_formatacao_nao_conteudo_de_string():
    assert _tokens_funcao("BEGIN RETURN NEW; END;") == _tokens_funcao("begin\n return new ; end")
    assert _tokens_funcao("RAISE EXCEPTION 'A B';") != _tokens_funcao("RAISE EXCEPTION 'A  B';")


@pytest.mark.parametrize(
    "a,b",
    [
        ("-- comentário\nRETURN NEW;", "-- comentário RETURN NEW;"),
        ("RETURN $q$ABC$q$;", "RETURN $q$abc$q$;"),
        ("/* a */ RETURN NEW;", "/*a*/ RETURN NEW;"),
    ],
)
def test_lexico_nao_coberto_nao_e_normalizado(a, b):
    assert _tokens_funcao(a) != _tokens_funcao(b)
