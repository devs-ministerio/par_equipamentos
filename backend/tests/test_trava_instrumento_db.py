"""Trava por instrumento na conclusão: precisa de transações reais (commit), por isso não usa a fixture com rollback."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import Convenio, InstrumentoEquipamento
from app.domain_errors import ConflictError
from app.repositories import conclusoes as repo
from app.services import conclusao_acompanhamento as svc


@pytest.fixture
def instrumento_gravado():
    numero = f"PYT{uuid4().hex[:8]}"
    with Session(engine) as s:
        s.add(Convenio(numero=numero, objeto="x", convenente_nome="x"))
        s.flush()
        inst = InstrumentoEquipamento(nr_convenio=numero, nome_convenente="x", tipo_contratacao="Convênio")
        s.add(inst)
        s.commit()
        instrumento_id = inst.id
    try:
        yield instrumento_id
    finally:
        with Session(engine) as s:
            s.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
            s.query(Convenio).filter_by(numero=numero).delete()
            s.commit()


def test_segunda_transacao_espera_a_primeira_e_desiste_com_conflito(instrumento_gravado, monkeypatch):
    monkeypatch.setattr(repo, "ESPERA_TRAVA_INSTRUMENTO", "300ms")
    with Session(engine) as a, Session(engine) as b:
        svc.travar_instrumento(a, instrumento_gravado)
        with pytest.raises(ConflictError, match="outra pessoa"):
            svc.travar_instrumento(b, instrumento_gravado)
        a.rollback()
        b.rollback()
        svc.travar_instrumento(b, instrumento_gravado)  # liberada: entra
        b.rollback()


def test_assert_nao_concluido_trava_o_instrumento(instrumento_gravado, monkeypatch):
    monkeypatch.setattr(repo, "ESPERA_TRAVA_INSTRUMENTO", "300ms")
    with Session(engine) as a, Session(engine) as b:
        svc.assert_nao_concluido(a, instrumento_gravado)
        with pytest.raises(ConflictError, match="outra pessoa"):
            svc.assert_nao_concluido(b, instrumento_gravado)
        a.rollback()
        b.rollback()
