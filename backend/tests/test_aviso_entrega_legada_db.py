"""Aviso de entrega antiga a vincular: um por instrumento, sem repetir."""

import pytest
from sqlalchemy import func, select

from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento, Notificacao, NotificacaoTipo
from scripts.vincular_entregas_legadas import Resultado, _avisar


@pytest.mark.db
def test_aviso_uma_vez_por_instrumento():
    db = SessionLocal()
    try:
        inst = db.scalar(select(InstrumentoEquipamento).limit(1))
        if inst is None:
            pytest.skip("sem instrumento na base de teste")
        for _ in range(2):
            resultado = Resultado(instrumentos_com_revisao={inst.id})
            _avisar(db, resultado, {inst.id: inst}, aplicar=True)
            db.flush()
        total = db.scalar(
            select(func.count()).where(
                Notificacao.tipo == NotificacaoTipo.entrega_legada_revisao, Notificacao.entidade_id == inst.id
            )
        )
        assert total == 1
    finally:
        db.rollback()
        db.close()


@pytest.mark.db
def test_vincular_nao_avisa_ninguem_por_padrao(monkeypatch):
    from scripts import vincular_entregas_legadas as modulo

    chamadas = []
    monkeypatch.setattr(modulo, "_avisar", lambda *a, **k: chamadas.append(1))
    db = SessionLocal()
    try:
        modulo.vincular(db, aplicar=False)
        assert chamadas == []
        modulo.vincular(db, aplicar=False, avisar=True)
        assert chamadas == [1]
    finally:
        db.rollback()
        db.close()
