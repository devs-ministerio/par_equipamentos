"""Índice único parcial de evento_marco: linha única só na fase geral."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo, MarcoGrupo

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


def _instrumento(db) -> InstrumentoEquipamento:
    inst = InstrumentoEquipamento(nr_convenio=f"IU{uuid4().hex[:10]}", nome_convenente="x", tipo_contratacao="Convênio")
    db.add(inst)
    db.flush()
    return inst


def _dois_ativos(db, inst, marco):
    db.add(EventoMarco(instrumento_id=inst.id, marco_id=marco.id, data_ocorrencia=date(2026, 1, 1)))
    db.flush()
    db.add(EventoMarco(instrumento_id=inst.id, marco_id=marco.id, data_ocorrencia=date(2026, 2, 1)))
    db.flush()


def test_todo_marco_de_fase_geral_do_catalogo_e_protegido(db):
    # Se um marco de fase geral entrar no catálogo depois da migration, este teste acusa o índice defasado.
    marcos = db.query(MarcoCatalogo).filter_by(grupo=MarcoGrupo.fase_geral).all()
    assert marcos
    for marco in marcos:
        inst = _instrumento(db)
        with pytest.raises(IntegrityError):
            with db.begin_nested():
                _dois_ativos(db, inst, marco)


@pytest.mark.parametrize("codigo", ["cronograma_entrega", "regulatorio_licenca_operacao", "regulatorio_matricula_cnen"])
def test_cronograma_e_regulatorio_aceitam_mais_de_um_ativo(db, codigo):
    marco = db.query(MarcoCatalogo).filter_by(codigo=codigo).one()
    _dois_ativos(db, _instrumento(db), marco)


def test_substituir_evento_de_fase_geral_respeita_o_indice(db):
    # A correção append-only precisa passar pelo índice único: o antigo sai de cena antes do novo entrar.
    from app.repositories import monitoramento as repo

    marco = db.query(MarcoCatalogo).filter_by(grupo=MarcoGrupo.fase_geral).first()
    inst = _instrumento(db)
    antigo = EventoMarco(instrumento_id=inst.id, marco_id=marco.id, data_ocorrencia=date(2026, 1, 1))
    db.add(antigo)
    db.flush()
    novo = EventoMarco(instrumento_id=inst.id, marco_id=marco.id, data_ocorrencia=date(2026, 2, 1))
    repo.substituir_evento(db, antigo, novo)
    db.flush()
    assert antigo.substituido_por_id == novo.id and novo.substituido_por_id is None
    ativos = db.query(EventoMarco).filter_by(instrumento_id=inst.id, marco_id=marco.id, substituido_por_id=None).all()
    assert [e.id for e in ativos] == [novo.id]


def test_garantir_indice_e_idempotente_e_recria_quando_a_lista_muda(db):
    from sqlalchemy import text

    from app.db.indices import INDICE_FASE_GERAL, garantir_indice_unico_fase_geral

    conexao = db.connection()
    assert garantir_indice_unico_fase_geral(conexao) is False  # já está certo
    conexao.execute(text(f"DROP INDEX {INDICE_FASE_GERAL}"))
    assert garantir_indice_unico_fase_geral(conexao) is True  # recriou
    assert garantir_indice_unico_fase_geral(conexao) is False
    definicao = conexao.execute(
        text("SELECT indexdef FROM pg_indexes WHERE indexname = :n"), {"n": INDICE_FASE_GERAL}
    ).scalar()
    assert "UNIQUE" in definicao
