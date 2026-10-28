"""Consolida EventoMarco com mais de 1 ativo pro mesmo (instrumento, marco).

Achado na auditoria de banco (2026-10-28): a regra "ativo = substituido_por_id IS NULL AND
deletado_em IS NULL, só 1 por marco" nunca foi garantida por constraint — 158 pares reais em
produção tinham mais de 1 evento ativo simultâneo, herdados de imports que nunca fecharam o
evento antigo. Esta consolidação precisa rodar e zerar os duplicados antes de a migração poder
criar o índice único (não dá pra criar UNIQUE com violação existente).

Critério de sobrevivente (mesma lógica que o app já usa implicitamente pra "evento vigente"):
tem data_ocorrencia preenchida > criado mais recente > id maior. Os demais do grupo apontam
`substituido_por_id` pro sobrevivente -- nunca apagados, nunca editados.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo
from scripts.consolidar_eventos_marco_duplicados import executar

pytestmark = pytest.mark.db


@pytest.fixture
def db():
    conexao = engine.connect()
    transacao = conexao.begin()
    # O índice único (migration c7d8e9f0a1b2) impede criar o duplicado que este script existe para
    # consolidar; sai dentro da transação de teste e volta com o rollback.
    conexao.exec_driver_sql("DROP INDEX IF EXISTS idx_evento_marco_ativo")
    sessao = Session(bind=conexao, join_transaction_mode="create_savepoint")
    try:
        yield sessao
    finally:
        sessao.close()
        transacao.rollback()
        conexao.close()


def _instrumento(db) -> InstrumentoEquipamento:
    inst = InstrumentoEquipamento(nr_convenio=f"CV{uuid4().hex[:10]}", nome_convenente="x", tipo_contratacao="Convênio")
    db.add(inst)
    db.flush()
    return inst


def _marco(db, codigo: str, grupo: str = "cronograma_fisico") -> MarcoCatalogo:
    marco = db.query(MarcoCatalogo).filter_by(codigo=codigo).one_or_none()
    if marco:
        return marco
    marco = MarcoCatalogo(codigo=codigo, rotulo=codigo, grupo=grupo, ordem=1)
    db.add(marco)
    db.flush()
    return marco


def _evento(db, inst, marco, *, data_ocorrencia=None, data_prevista=None, criado_em=None):
    ev = EventoMarco(
        instrumento_id=inst.id,
        marco_id=marco.id,
        data_ocorrencia=data_ocorrencia,
        data_prevista=data_prevista,
    )
    db.add(ev)
    db.flush()
    if criado_em is not None:
        momento = datetime(criado_em.year, criado_em.month, criado_em.day, tzinfo=UTC)
        db.execute(EventoMarco.__table__.update().where(EventoMarco.id == ev.id).values(created_at=momento))
        db.flush()
        db.refresh(ev)
    return ev


def test_sem_duplicado_e_noop(db):
    inst = _instrumento(db)
    marco = _marco(db, "cronograma_entrega")
    _evento(db, inst, marco, data_ocorrencia=date(2026, 1, 1))
    resultado = executar(db, aplicar=True)
    assert inst.id not in resultado.por_instrumento


def test_resolve_vazio_mais_preenchido_apontando_pro_preenchido(db):
    inst = _instrumento(db)
    marco = _marco(db, "cronograma_entrega")
    vazio = _evento(db, inst, marco, criado_em=date(2026, 9, 9))
    preenchido = _evento(db, inst, marco, data_ocorrencia=date(2026, 5, 1), criado_em=date(2026, 9, 20))
    resultado = executar(db, aplicar=True)
    db.refresh(vazio)
    db.refresh(preenchido)
    assert resultado.por_instrumento[inst.id] == [(vazio.id, preenchido.id)]
    assert vazio.substituido_por_id == preenchido.id
    assert preenchido.substituido_por_id is None


def test_resolve_dois_preenchidos_com_mesma_data_fica_so_o_mais_recente(db):
    inst = _instrumento(db)
    marco = _marco(db, "fase_concluido", grupo="fase_geral")
    antigo = _evento(db, inst, marco, data_ocorrencia=date(2026, 5, 1), criado_em=date(2026, 9, 9))
    novo = _evento(db, inst, marco, data_ocorrencia=date(2026, 5, 1), criado_em=date(2026, 9, 25))
    executar(db, aplicar=True)
    db.refresh(antigo)
    db.refresh(novo)
    assert antigo.substituido_por_id == novo.id
    assert novo.substituido_por_id is None


def test_data_ocorrencia_preenchida_vence_sobre_so_data_prevista_mesmo_sendo_mais_antigo(db):
    inst = _instrumento(db)
    marco = _marco(db, "cronograma_previsao_inauguracao")
    so_previsao = _evento(db, inst, marco, data_prevista=date(2026, 12, 1), criado_em=date(2026, 9, 25))
    com_ocorrencia = _evento(db, inst, marco, data_ocorrencia=date(2026, 6, 1), criado_em=date(2026, 9, 9))
    executar(db, aplicar=True)
    db.refresh(so_previsao)
    db.refresh(com_ocorrencia)
    assert so_previsao.substituido_por_id == com_ocorrencia.id
    assert com_ocorrencia.substituido_por_id is None


def test_tres_ativos_no_mesmo_grupo_fica_so_1_vigente(db):
    inst = _instrumento(db)
    marco = _marco(db, "regulatorio_licenca_operacao", grupo="regulatorio")
    e1 = _evento(db, inst, marco, criado_em=date(2026, 9, 9))
    e2 = _evento(db, inst, marco, data_prevista=date(2026, 11, 30), criado_em=date(2026, 9, 18))
    e3 = _evento(db, inst, marco, data_prevista=date(2026, 11, 30), criado_em=date(2026, 9, 28))
    executar(db, aplicar=True)
    db.refresh(e1)
    db.refresh(e2)
    db.refresh(e3)
    ativos = [e for e in (e1, e2, e3) if e.substituido_por_id is None]
    assert len(ativos) == 1
    assert ativos[0].id == e3.id


def test_nao_altera_evento_ja_substituido_ou_deletado(db):
    inst = _instrumento(db)
    marco = _marco(db, "cronograma_entrega")
    ja_substituido = _evento(db, inst, marco, data_ocorrencia=date(2026, 1, 1))
    vigente = _evento(db, inst, marco, data_ocorrencia=date(2026, 2, 1))
    ja_substituido.substituido_por_id = vigente.id
    db.flush()
    resultado = executar(db, aplicar=True)
    assert inst.id not in resultado.por_instrumento


def test_simulacao_nao_grava(db):
    inst = _instrumento(db)
    marco = _marco(db, "cronograma_entrega")
    vazio = _evento(db, inst, marco, criado_em=date(2026, 9, 9))
    preenchido = _evento(db, inst, marco, data_ocorrencia=date(2026, 5, 1), criado_em=date(2026, 9, 20))
    resultado = executar(db, aplicar=False)
    db.expire_all()
    assert vazio.substituido_por_id is None
    assert preenchido.substituido_por_id is None
    assert resultado.por_instrumento[inst.id] == [(vazio.id, preenchido.id)]


def test_idempotente(db):
    inst = _instrumento(db)
    marco = _marco(db, "cronograma_entrega")
    _evento(db, inst, marco, criado_em=date(2026, 9, 9))
    _evento(db, inst, marco, data_ocorrencia=date(2026, 5, 1), criado_em=date(2026, 9, 20))
    executar(db, aplicar=True)
    resultado = executar(db, aplicar=True)
    assert inst.id not in resultado.por_instrumento
