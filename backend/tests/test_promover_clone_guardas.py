"""Nomes não autorizados param antes de qualquer I/O de promoção."""

from unittest.mock import Mock

import pytest
from sqlalchemy import Connection
from sqlalchemy.engine import make_url

from scripts.preparar_clone_persistente import preparar_clone_persistente
from scripts.promover_clone_recuperacao import _validar_controlador, promover_copia_privada


@pytest.mark.parametrize(
    "nome",
    [
        "sigeo_homologacao_clone_20261006",
        "sigeo_homologacao_clone_20261017",
        "sigeo_test_migrations_",
        "sigeo_test_migrations_" + "g" * 32,
        "sigeo_test_migrations_" + "a" * 32 + '"; DROP DATABASE outro;',
    ],
)
def test_nome_invalido_nao_conecta_nem_executa_sql(nome):
    controlador = Mock(spec=Connection)
    controlador.in_transaction.return_value = False
    with pytest.raises(ValueError, match="Nome não autorizado"):
        promover_copia_privada(controlador, nome=nome, esperado={})
    controlador.begin.assert_not_called()
    controlador.execute.assert_not_called()


def test_transacao_alheia_nao_e_commitada_pela_promocao():
    controlador = Mock(spec=Connection)
    controlador.in_transaction.return_value = True
    with pytest.raises(ValueError, match="transação própria"):
        promover_copia_privada(controlador, nome="sigeo_test_migrations_" + "a" * 32, esperado={})
    controlador.begin.assert_not_called()
    controlador.commit.assert_not_called()


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://local@remoto.invalid/sigeo_test_clone_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_homologacao_clone_20261006",
        "postgresql+psycopg://local@127.0.0.1/sigeo_test_clone_20261006?options=-csearch_path=outro",
        "sqlite:///:memory:",
    ],
)
def test_preparacao_recusa_controlador_fora_escopo_sem_criar_banco(url):
    with pytest.raises(ValueError):
        preparar_clone_persistente(make_url(url))


@pytest.mark.parametrize("endereco,porta", [("203.0.113.10", 5432), ("127.0.0.1", 5433), (None, None)])
def test_controlador_recusa_redirecionamento_efetivo_do_servidor(endereco, porta):
    # Mock somente na fronteira SQL; a guarda real confronta URL, banco e
    # endereço/porta efetivos. Não simula resultado da própria validação.
    conn = Mock(spec=Connection)
    conn.engine = Mock()
    conn.engine.url = make_url("postgresql+psycopg://local@127.0.0.1:5432/sigeo_test_clone_20261006")
    conn.scalar.return_value = "sigeo_test_clone_20261006"
    conn.execute.return_value.one.return_value = (endereco, porta)
    with pytest.raises(ValueError, match="Servidor efetivo"):
        _validar_controlador(conn)
    conn.commit.assert_not_called()
