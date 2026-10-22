"""Nova composição não amplia a permissão de acessar bancos preservados."""

from unittest.mock import Mock

import pytest
from sqlalchemy import Connection
from sqlalchemy.engine import make_url

from scripts.transferencia_sintetica_recuperacao import adotar_sintetico_atomico


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://local@remoto.invalid/sigeo_test_migrations_" + "a" * 32,
        "postgresql+psycopg://local@127.0.0.1/sigeo_homologacao_clone_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_homologacao_base_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_test_clone_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_test_migrations_" + "a" * 32 + "?options=-csearch_path=outro",
        "sqlite:///:memory:",
    ],
)
def test_origem_invalida_rejeitada_antes_de_qualquer_sql(url):
    origem, destino = Mock(spec=Connection), Mock(spec=Connection)
    origem.engine = Mock()
    origem.engine.url = make_url(url)
    destino.in_transaction.return_value = False
    destino.begin.return_value.__enter__ = Mock()
    destino.begin.return_value.__exit__ = Mock(return_value=False)
    with pytest.raises(ValueError):
        adotar_sintetico_atomico(origem=origem, destino=destino, bootstrap={})
    origem.scalar.assert_not_called()
    origem.execute.assert_not_called()
    destino.scalar.assert_not_called()
    destino.execute.assert_not_called()
