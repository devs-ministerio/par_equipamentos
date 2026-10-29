"""Reabertura dos eventos de cronograma/regulatório escondidos pela consolidação de 28/10/2026."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import engine
from app.db.models import EntregaEquipamento, EventoMarco, InstrumentoEquipamento, MarcoCatalogo
from scripts.reabrir_eventos_consolidados import ACAO_CONSOLIDACAO, executar

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
    inst = InstrumentoEquipamento(nr_convenio=f"RE{uuid4().hex[:10]}", nome_convenente="x", tipo_contratacao="Convênio")
    db.add(inst)
    db.flush()
    return inst


def _marco(db, codigo: str) -> MarcoCatalogo:
    return db.query(MarcoCatalogo).filter_by(codigo=codigo).one()


def _marco_fase_geral(db) -> MarcoCatalogo:
    return db.query(MarcoCatalogo).filter_by(grupo="fase_geral").order_by(MarcoCatalogo.id).first()


def _par_consolidado(db, inst, marco, *, d1=date(2026, 1, 1), d2=date(2026, 6, 1)):
    """Dois eventos do mesmo marco; o primeiro foi escondido pela consolidação e a auditoria registra isso."""
    vigente = EventoMarco(instrumento_id=inst.id, marco_id=marco.id, data_ocorrencia=d2)
    db.add(vigente)
    db.flush()
    escondido = EventoMarco(
        instrumento_id=inst.id, marco_id=marco.id, data_ocorrencia=d1, substituido_por_id=vigente.id
    )
    db.add(escondido)
    db.flush()
    log_action(
        db,
        user_id=None,
        entity_name="instrumento_equipamento",
        entity_id=inst.id,
        action=ACAO_CONSOLIDACAO,
        details={"substituidos": [{"evento_id": escondido.id, "sobrevivente_id": vigente.id}]},
    )
    db.flush()
    return escondido, vigente


def test_reabre_cronograma_do_instrumento_indicado(db):
    inst = _instrumento(db)
    escondido, vigente = _par_consolidado(db, inst, _marco(db, "regulatorio_matricula_cnen"))
    resultado = executar(db, aplicar=True, instrumentos=[inst.nr_convenio])
    db.refresh(escondido)
    assert [e.evento_id for e in resultado.reabertos] == [escondido.id]
    assert escondido.substituido_por_id is None and vigente.substituido_por_id is None


def test_nao_reabre_instrumento_nao_indicado(db):
    inst = _instrumento(db)
    escondido, _ = _par_consolidado(db, inst, _marco(db, "regulatorio_matricula_cnen"))
    resultado = executar(db, aplicar=True, instrumentos=[])
    db.refresh(escondido)
    assert resultado.reabertos == [] and escondido.substituido_por_id is not None


def test_nunca_reabre_fase_geral(db):
    inst = _instrumento(db)
    escondido, _ = _par_consolidado(db, inst, _marco_fase_geral(db))
    resultado = executar(db, aplicar=True, instrumentos=[inst.nr_convenio])
    db.refresh(escondido)
    assert resultado.reabertos == [] and escondido.substituido_por_id is not None


def test_reabre_evento_ligado_a_entrega_mesmo_sem_indicar_o_instrumento(db):
    inst = _instrumento(db)
    escondido, _ = _par_consolidado(db, inst, _marco(db, "cronograma_entrega"))
    db.add(
        EntregaEquipamento(
            instrumento_id=inst.id,
            evento_id=escondido.id,
            data_ocorrencia=date(2026, 1, 1),
            chave_idempotencia=uuid4().hex,
        )
    )
    db.flush()
    resultado = executar(db, aplicar=True, instrumentos=[])
    db.refresh(escondido)
    assert [(e.evento_id, e.motivo) for e in resultado.reabertos] == [(escondido.id, "ligado a uma entrega")]
    assert escondido.substituido_por_id is None


def test_simulacao_nao_grava_e_execucao_repetida_nao_faz_nada(db):
    inst = _instrumento(db)
    escondido, _ = _par_consolidado(db, inst, _marco(db, "regulatorio_matricula_cnen"))
    simulado = executar(db, aplicar=False, instrumentos=[inst.nr_convenio])
    db.expire_all()
    assert len(simulado.reabertos) == 1 and escondido.substituido_por_id is not None
    executar(db, aplicar=True, instrumentos=[inst.nr_convenio])
    assert executar(db, aplicar=True, instrumentos=[inst.nr_convenio]).reabertos == []


def test_evento_editado_depois_da_consolidacao_nao_e_mexido(db):
    inst = _instrumento(db)
    escondido, vigente = _par_consolidado(db, inst, _marco(db, "regulatorio_matricula_cnen"))
    corrigido = EventoMarco(instrumento_id=inst.id, marco_id=vigente.marco_id, data_ocorrencia=date(2026, 7, 1))
    db.add(corrigido)
    db.flush()
    escondido.substituido_por_id = corrigido.id  # alguém reapontou depois da consolidação
    db.flush()
    resultado = executar(db, aplicar=True, instrumentos=[inst.nr_convenio])
    assert resultado.reabertos == []


def test_instrumento_inexistente_e_informado(db):
    assert executar(db, aplicar=False, instrumentos=["NAO-EXISTE"]).instrumentos_desconhecidos == ["NAO-EXISTE"]
