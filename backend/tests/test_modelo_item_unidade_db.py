"""Modelo de item, entrega e unidade: constraints reais no PostgreSQL."""

import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.base import SessionLocal
from app.db.models import Convenio, EntregaEquipamento, InstrumentoEquipamento, ItemPlano, UnidadeEquipamento


def _base(db):
    conv = Convenio(numero=f"T{uuid.uuid4().hex[:8]}", objeto="teste", convenente_nome="Teste")
    db.add(conv)
    db.flush()
    inst = db.scalar(select(InstrumentoEquipamento).limit(1))
    return conv, inst


@pytest.mark.db
def test_serie_unica_dentro_do_item_ordem_unica_e_quantidade_minima():
    db = SessionLocal()
    try:
        conv, inst = _base(db)
        if inst is None:
            pytest.skip("sem instrumento na base de teste")
        item = ItemPlano(convenio_id=conv.id, origem="manual", id_origem=f"t:{uuid.uuid4().hex}", descricao="Mamógrafo")
        db.add(item)
        entrega = EntregaEquipamento(
            instrumento_id=inst.id, data_ocorrencia=date(2026, 1, 1), chave_idempotencia=str(uuid.uuid4())
        )
        db.add(entrega)
        db.flush()
        db.add(UnidadeEquipamento(entrega_id=entrega.id, item_id=item.id, ordem=1, numero_serie="S1"))
        db.flush()
        with pytest.raises(IntegrityError):
            with db.begin_nested():
                db.add(UnidadeEquipamento(entrega_id=entrega.id, item_id=item.id, ordem=2, numero_serie="S1"))
                db.flush()
        with pytest.raises(IntegrityError):
            with db.begin_nested():
                db.add(UnidadeEquipamento(entrega_id=entrega.id, item_id=item.id, ordem=1))
                db.flush()
        # série ausente pode repetir
        db.add(UnidadeEquipamento(entrega_id=entrega.id, item_id=item.id, ordem=2))
        db.add(UnidadeEquipamento(entrega_id=entrega.id, item_id=item.id, ordem=3))
        db.flush()
        with pytest.raises(IntegrityError):
            with db.begin_nested():
                db.add(
                    ItemPlano(
                        convenio_id=conv.id,
                        origem="manual",
                        id_origem=f"t:{uuid.uuid4().hex}",
                        descricao="x",
                        quantidade_planejada=0,
                    )
                )
                db.flush()
    finally:
        db.rollback()
        db.close()
