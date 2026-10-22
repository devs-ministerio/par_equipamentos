"""Guardas de URL rejeitam entrada inválida antes de executar SQL."""

from unittest.mock import Mock

import pytest
from sqlalchemy import Connection
from sqlalchemy.engine import make_url

from scripts.transferencia_sintetica_recuperacao import integridade_tabelas


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://local@servidor-remoto.invalid:5432/sigeo_test_migrations_" + "a" * 32,
        "postgresql+psycopg://local@127.0.0.1:5432/sigeo_homologacao_clone_20261006",
        "postgresql+psycopg://local@127.0.0.1:5432/sigeo_test_clone_20261006",
        "postgresql+psycopg://local@127.0.0.1:5432/sigeo_test_migrations_" + "a" * 32 + "?options=-csearch_path=outro",
        "sqlite:///:memory:",
    ],
)
def test_banco_fora_do_escopo_nao_executa_consulta(url):
    # Mock somente da conexão (I/O); a guarda sob teste roda sem substituição.
    conn = Mock(spec=Connection)
    conn.engine = Mock()
    conn.engine.url = make_url(url)
    with pytest.raises(ValueError):
        integridade_tabelas(conn)
    conn.scalar.assert_not_called()
    conn.execute.assert_not_called()
