"""Scripts de migração do fluxo de acompanhamento (19/11/2026) contra PostgreSQL real.

Cada teste roda numa transação externa com SAVEPOINT; nada permanece no banco de teste. Os scripts varrem o banco
inteiro, então as asserções olham só para os instrumentos criados aqui.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import (
    AcaoMonitoramento,
    AuditLog,
    ConclusaoInstrumento,
    Convenio,
    EntregaEquipamento,
    EventoMarco,
    InstrumentoEquipamento,
    ItemPlano,
    MarcoCatalogo,
    UnidadeEquipamento,
)
from scripts.corrigir_entregas_persus_i import executar as corrigir_persus_i
from scripts.migrar_concluidos_para_conclusao import executar as migrar_concluidos
from scripts.remover_persus_ii_do_monitoramento import executar as remover_persus_ii

pytestmark = pytest.mark.db

INAUGURACAO = date(2024, 5, 10)


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


def _marco(db, codigo: str) -> MarcoCatalogo:
    return db.scalars(select(MarcoCatalogo).where(MarcoCatalogo.codigo == codigo)).one()


def _instrumento(db, *, tipo: str = "Convênio", tipo_convenio: str | None = None, quantidade: int | None = 1):
    numero = f"PYT{uuid4().hex[:9]}"
    convenio = Convenio(numero=numero, objeto="x", convenente_nome="x", tipo_contratacao=tipo_convenio or tipo)
    db.add(convenio)
    db.flush()
    inst = InstrumentoEquipamento(nr_convenio=numero, nome_convenente="x", tipo_contratacao=tipo)
    db.add(inst)
    db.flush()
    item = ItemPlano(
        convenio_id=convenio.id,
        instrumento_id=inst.id,
        origem="manual",
        id_origem=f"t:{uuid4().hex}",
        descricao="Acelerador",
        controla_unidade=True,
        quantidade_planejada=quantidade,
    )
    db.add(item)
    db.flush()
    return inst, item


def _evento(db, inst, codigo: str, **campos) -> EventoMarco:
    evento = EventoMarco(instrumento_id=inst.id, marco_id=_marco(db, codigo).id, **campos)
    db.add(evento)
    db.flush()
    return evento


def _entregar(db, inst, item, data: date) -> EntregaEquipamento:
    entrega = EntregaEquipamento(
        instrumento_id=inst.id, data_ocorrencia=data, chave_idempotencia=f"pyt-{uuid4().hex}", autor_id=None
    )
    db.add(entrega)
    db.flush()
    db.add(UnidadeEquipamento(entrega_id=entrega.id, item_id=item.id, ordem=1))
    db.flush()
    return entrega


def test_remove_persus_ii_sem_lancamento_e_preserva_quem_tem(db):
    # Given: dois instrumentos "Convênio" cujo convênio é PERSUS II; um deles já tem evento
    livre, item = _instrumento(db, tipo_convenio="PERSUS II")
    com_evento, _ = _instrumento(db, tipo_convenio="PERSUS II")
    _evento(db, com_evento, "cronograma_inicio_fabricacao", data_ocorrencia=date(2024, 1, 1))
    livre_id, item_id, livre_numero = livre.id, item.id, livre.nr_convenio
    # When
    simulacao = remover_persus_ii(db, aplicar=False)
    assert db.get(InstrumentoEquipamento, livre_id) is not None
    assert simulacao["a remover"] >= 1
    remover_persus_ii(db, aplicar=True)
    db.flush()
    db.expire_all()
    # Then
    assert db.get(InstrumentoEquipamento, livre_id) is None
    assert db.get(ItemPlano, item_id).instrumento_id is None
    assert db.get(InstrumentoEquipamento, com_evento.id) is not None
    auditoria = db.scalars(
        select(AuditLog).where(AuditLog.entity_name == "instrumento_equipamento", AuditLog.entity_id == livre_id)
    ).all()
    assert [a.action for a in auditoria] == ["removed_by_request"]
    assert auditoria[0].details["nr_convenio"] == livre_numero


def test_persus_i_cria_entrega_na_data_da_inauguracao_e_corrige_a_divergente(db):
    # Given: um sem entrega e outro com entrega em data diferente da inauguração
    sem_entrega, item_a = _instrumento(db, tipo="PERSUS I")
    divergente, item_b = _instrumento(db, tipo="PERSUS I")
    for inst in (sem_entrega, divergente):
        _evento(db, inst, "cronograma_previsao_inauguracao", data_ocorrencia=INAUGURACAO)
    entrega_antiga = _entregar(db, divergente, item_b, INAUGURACAO + timedelta(days=30))
    # When
    corrigir_persus_i(db, aplicar=True)
    db.flush()
    db.expire_all()
    # Then
    criada = db.scalars(select(EntregaEquipamento).where(EntregaEquipamento.instrumento_id == sem_entrega.id)).one()
    assert criada.data_ocorrencia == INAUGURACAO
    assert db.scalars(select(UnidadeEquipamento).where(UnidadeEquipamento.entrega_id == criada.id)).one().item_id == (
        item_a.id
    )
    assert db.get(EntregaEquipamento, entrega_antiga.id).data_ocorrencia == INAUGURACAO
    acoes = {
        a.action
        for a in db.scalars(select(AuditLog).where(AuditLog.entity_name == "entrega_equipamento")).all()
        if a.entity_id in (criada.id, entrega_antiga.id)
    }
    assert acoes == {"created", "data_corrigida_inauguracao_persus_i"}


def test_persus_i_e_idempotente_e_nao_toca_concluido(db):
    # Given
    inst, _ = _instrumento(db, tipo="PERSUS I")
    _evento(db, inst, "cronograma_previsao_inauguracao", data_ocorrencia=INAUGURACAO)
    concluido, _ = _instrumento(db, tipo="PERSUS I")
    _evento(db, concluido, "cronograma_previsao_inauguracao", data_ocorrencia=INAUGURACAO)
    db.add(ConclusaoInstrumento(instrumento_id=concluido.id, resultado="integral", data_conclusao=INAUGURACAO))
    db.flush()
    # When
    corrigir_persus_i(db, aplicar=True)
    segunda = corrigir_persus_i(db, aplicar=True)
    db.flush()
    # Then
    assert segunda["entrega criada"] == 0
    assert len(db.scalars(select(EntregaEquipamento).where(EntregaEquipamento.instrumento_id == inst.id)).all()) == 1
    assert (
        db.scalars(select(EntregaEquipamento).where(EntregaEquipamento.instrumento_id == concluido.id)).first() is None
    )


def _concluido_legado(db, *, entregue: bool, data: date | None = date(2025, 1, 10)):
    inst, item = _instrumento(db)
    evento = _evento(db, inst, "fase_concluido", data_ocorrencia=data)
    if entregue:
        _entregar(db, inst, item, date(2024, 12, 1))
    return inst, evento


def _acao_aberta(db, inst) -> AcaoMonitoramento:
    acao = AcaoMonitoramento(instrumento_id=inst.id, descricao="Relatório fotográfico OK")
    db.add(acao)
    db.flush()
    return acao


def test_concluido_legado_sem_pendencia_vira_conclusao_integral(db):
    # Given
    inst, _ = _concluido_legado(db, entregue=True)
    _evento(db, inst, "cronograma_previsao_inauguracao", data_ocorrencia=INAUGURACAO)
    # When
    migrar_concluidos(db, aplicar=True)
    db.flush()
    # Then
    conclusao = db.scalars(select(ConclusaoInstrumento).where(ConclusaoInstrumento.instrumento_id == inst.id)).one()
    assert (conclusao.resultado, conclusao.data_conclusao, conclusao.data_inauguracao) == (
        "integral",
        date(2025, 1, 10),
        INAUGURACAO,
    )


def test_acao_aberta_e_concluida_e_pendencia_real_vai_para_revisao(db):
    # Given: duas conclusões antigas, cada uma com ação aberta; uma é pendência real
    fecha, _ = _concluido_legado(db, entregue=True)
    acao = _acao_aberta(db, fecha)
    real, evento_real = _concluido_legado(db, entregue=True)
    acao_real = _acao_aberta(db, real)
    # When
    _, revisao = migrar_concluidos(db, aplicar=True, pendencias_reais={real.nr_convenio})
    db.flush()
    db.refresh(evento_real)
    # Then
    assert acao.data_conclusao == date.today()
    assert db.scalars(select(ConclusaoInstrumento).where(ConclusaoInstrumento.instrumento_id == fecha.id)).one()
    assert acao_real.data_conclusao is None
    assert (real.nr_convenio, "impedimentos: acao_aberta") in revisao
    assert evento_real.deletado_em is not None
    assert (
        db.scalars(select(ConclusaoInstrumento).where(ConclusaoInstrumento.instrumento_id == real.id)).first() is None
    )


def test_concluido_sem_entrega_ou_sem_data_sai_de_concluido_e_a_simulacao_nao_grava(db):
    # Given
    sem_entrega, evento_a = _concluido_legado(db, entregue=False)
    sem_data, evento_b = _concluido_legado(db, entregue=True, data=None)
    # When: simulação não altera nada
    migrar_concluidos(db, aplicar=False)
    db.refresh(evento_a)
    assert evento_a.deletado_em is None
    migrar_concluidos(db, aplicar=True)
    db.flush()
    db.refresh(evento_a)
    db.refresh(evento_b)
    # Then
    assert evento_a.deletado_em is not None and evento_b.deletado_em is not None
    assert "revisão" in evento_a.motivo_exclusao or "revis" in evento_a.motivo_exclusao
    for inst in (sem_entrega, sem_data):
        assert (
            db.scalars(select(ConclusaoInstrumento).where(ConclusaoInstrumento.instrumento_id == inst.id)).first()
            is None
        )
