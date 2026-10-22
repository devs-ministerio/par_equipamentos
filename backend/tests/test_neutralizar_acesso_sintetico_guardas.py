"""URL sem escopo é rejeitada antes de SQL, inclusive o clone protegido."""

from unittest.mock import Mock

import pytest
from sqlalchemy import Connection
from sqlalchemy.engine import make_url

from scripts.neutralizar_acesso_sintetico import neutralizar_acesso_sintetico


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
def test_nao_executa_sql_fora_de_banco_descartavel(url):
    conn = Mock(spec=Connection)
    conn.engine = Mock()
    conn.engine.url = make_url(url)
    conn.in_transaction.return_value = False
    conn.begin.return_value.__enter__ = Mock()
    conn.begin.return_value.__exit__ = Mock(return_value=False)
    with pytest.raises(ValueError):
        neutralizar_acesso_sintetico(destino=conn, esperado={})
    conn.execute.assert_not_called()
    conn.scalar.assert_not_called()
