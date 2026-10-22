"""Fronteira de conexão inválida deve falhar antes de qualquer SQL."""

from unittest.mock import Mock

import pytest
from sqlalchemy import Connection
from sqlalchemy.engine import make_url

from scripts.preflight_clone_recuperacao import inventariar_acesso_clone


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://local@remoto.invalid/sigeo_homologacao_clone_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_homologacao_base_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_test_clone_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_homologacao_clone_20261006?options=-csearch_path=outro",
        "sqlite:///:memory:",
    ],
)
def test_url_fora_escopo_nao_executa_sql(url):
    conn = Mock(spec=Connection)
    conn.engine = Mock()
    conn.engine.url = make_url(url)
    with pytest.raises(ValueError):
        inventariar_acesso_clone(conn)
    conn.scalar.assert_not_called()
    conn.execute.assert_not_called()
