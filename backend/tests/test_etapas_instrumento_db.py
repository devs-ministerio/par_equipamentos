"""Datas das etapas do instrumento para o Painel de gestão: publicação, primeira entrega, conclusão e inauguração dispensada."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import Convenio, EntregaEquipamento, EventoMarco, InstrumentoEquipamento, MarcoCatalogo
from app.repositories import etapas_instrumento as repo

pytestmark = pytest.mark.db


@pytest.fixture
def db():
    conexao = engine.connect()
    transacao = conexao.begin()
    sessao = Session(bind=conexao, join_transaction_mode="create_savepoint")
    try:
        yield sessao
    finally:
        sessao.close()
        transacao.rollback()
        conexao.close()


def _instrumento(db, publicacao=None):
    numero = f"ET{uuid4().hex[:8]}"
    db.add(
        Convenio(
            numero=numero, objeto="x", convenente_nome="x", uf="ZZ", tipo_contratacao="Convênio", data_publicacao=publicacao
        )
    )
    inst = InstrumentoEquipamento(nr_convenio=numero, nome_convenente="x", tipo_contratacao="Convênio", uf="ZZ")
    db.add(inst)
    db.flush()
    return inst


def test_publicacao_e_primeira_entrega_ativa(db):
    inst = _instrumento(db, publicacao=date(2024, 1, 5))
    for dia, substituida in ((date(2025, 3, 10), False), (date(2025, 2, 1), False), (date(2024, 12, 1), True)):
        entrega = EntregaEquipamento(
            instrumento_id=inst.id, data_ocorrencia=dia, chave_idempotencia=f"k{uuid4().hex}"
        )
        db.add(entrega)
        db.flush()
        if substituida:
            outro = EntregaEquipamento(
                instrumento_id=inst.id, data_ocorrencia=date(2025, 5, 1), chave_idempotencia=f"k{uuid4().hex}"
            )
            db.add(outro)
            db.flush()
            entrega.substituido_por_id = outro.id
    db.flush()
    assert repo.publicacoes_por_numero(db, [inst.nr_convenio]) == {inst.nr_convenio: date(2024, 1, 5)}
    assert repo.primeira_entrega_por_instrumento(db, [inst.id]) == {inst.id: date(2025, 2, 1)}


def test_inauguracao_dispensada_so_conta_evento_ativo(db):
    inst = _instrumento(db)
    sem = _instrumento(db)
    marco = db.execute(select(MarcoCatalogo).where(MarcoCatalogo.codigo == repo.MARCO_DISPENSADA)).scalar_one()
    db.add(EventoMarco(instrumento_id=inst.id, marco_id=marco.id, observacao="Dispensada na entrega"))
    db.flush()
    assert repo.ids_com_inauguracao_dispensada(db, [inst.id, sem.id]) == {inst.id}
