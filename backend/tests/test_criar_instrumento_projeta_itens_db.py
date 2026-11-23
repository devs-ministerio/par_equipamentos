"""Criar o instrumento projeta os itens do plano: liga ao instrumento e aplica a exceção (caso 970368)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.auth import hash_password
from app.db.models import Convenio, ItemPlano, User, UserRole
from app.services.monitoramento_instrumentos import NovoInstrumentoMonitorado, criar_instrumento_monitorado_sem_commit
from tests.test_entregas_equipamento_db import db  # noqa: F401

pytestmark = pytest.mark.db


def _usuario(db, role: UserRole) -> User:  # noqa: F811
    u = User(
        name=f"{role.value} pytest",
        email=f"pytest-criar-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=role,
    )
    db.add(u)
    db.flush()
    return u


def _convenio(db, itens: list[dict]) -> Convenio:  # noqa: F811
    conv = Convenio(
        numero=f"PYT{uuid4().hex[:8]}",
        objeto="x",
        convenente_nome="x",
        tipo_contratacao="Convênio",
        siconv_raw={"itens_plano_aplicacao": itens},
    )
    db.add(conv)
    db.flush()
    return conv


def _criar(db, conv: Convenio):  # noqa: F811
    admin = _usuario(db, UserRole.admin)
    titular = _usuario(db, UserRole.colaborador)
    dados = NovoInstrumentoMonitorado(
        nr_convenio=conv.numero,
        cnpj_convenente=None,
        nome_convenente="x",
        tipo_contratacao="Convênio",
        tecnico_titular_id=titular.id,
    )
    return criar_instrumento_monitorado_sem_commit(dados=dados, db=db, usuario=admin)


def _itens(db, conv: Convenio) -> dict[str, ItemPlano]:  # noqa: F811
    linhas = db.execute(select(ItemPlano).where(ItemPlano.convenio_id == conv.id)).scalars()
    return {i.id_origem: i for i in linhas}


def test_instrumento_sem_item_controlado_recebe_a_excecao_por_valor(db):  # noqa: F811
    conv = _convenio(
        db,
        [
            {"ID_ITEM_PAD": "9001", "DESCRICAO_ITEM": "Mesa auxiliar", "QTD_ITEM": "1", "VALOR_TOTAL_ITEM": "150000"},
            {"ID_ITEM_PAD": "9002", "DESCRICAO_ITEM": "Banqueta", "QTD_ITEM": "10", "VALOR_TOTAL_ITEM": "5000"},
        ],
    )

    instrumento = _criar(db, conv)

    itens = _itens(db, conv)
    assert all(i.instrumento_id == instrumento.id for i in itens.values())
    assert itens["9001"].controla_unidade is True
    assert itens["9002"].controla_unidade is False


def test_instrumento_com_item_controlado_nao_recebe_a_excecao(db):  # noqa: F811
    conv = _convenio(
        db,
        [
            {
                "ID_ITEM_PAD": "9101",
                "DESCRICAO_ITEM": "Mamógrafo digital",
                "QTD_ITEM": "1",
                "VALOR_TOTAL_ITEM": "400000",
            },
            {"ID_ITEM_PAD": "9102", "DESCRICAO_ITEM": "Mesa auxiliar", "QTD_ITEM": "1", "VALOR_TOTAL_ITEM": "150000"},
        ],
    )

    instrumento = _criar(db, conv)

    itens = _itens(db, conv)
    assert all(i.instrumento_id == instrumento.id for i in itens.values())
    assert itens["9101"].controla_unidade is True
    assert itens["9102"].controla_unidade is False
