"""Ajuste em lote da resposta sobre inauguração: concluído integral vira dispensada, em aberto com realizada volta
a sem registro, e acelerador linear nunca é alterado."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import (
    ConclusaoInstrumento,
    Convenio,
    EquipamentoCatalogo,
    EventoMarco,
    InstrumentoEquipamento,
    ItemPlano,
    MarcoCatalogo,
)
from scripts.ajustar_inauguracao_entregues import MARCO_DISPENSADA, MARCO_PREVISAO, executar

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


def _instrumento(db, *, integral=False, acelerador=False):
    numero = f"AJ{uuid4().hex[:8]}"
    convenio = Convenio(numero=numero, objeto="x", convenente_nome="x", uf="ZZ", tipo_contratacao="Convênio")
    db.add(convenio)
    inst = InstrumentoEquipamento(nr_convenio=numero, nome_convenente="x", tipo_contratacao="Convênio", uf="ZZ")
    db.add(inst)
    db.flush()
    if integral:
        db.add(ConclusaoInstrumento(instrumento_id=inst.id, resultado="integral", data_conclusao=date(2025, 1, 1)))
    if acelerador:
        catalogo = db.execute(
            select(EquipamentoCatalogo).where(EquipamentoCatalogo.codigo == "acelerador_linear")
        ).scalar_one()
        db.add(
            ItemPlano(
                convenio_id=convenio.id,
                instrumento_id=inst.id,
                origem="manual",
                id_origem=f"t:{uuid4().hex}",
                descricao="Acelerador Linear",
                catalogo_id=catalogo.id,
                quantidade_planejada=1,
            )
        )
    db.flush()
    return inst


def _marco(db, codigo):
    return db.execute(select(MarcoCatalogo).where(MarcoCatalogo.codigo == codigo)).scalar_one()


def _ativos(db, inst, codigo):
    marco = _marco(db, codigo)
    return (
        db.execute(
            select(EventoMarco).where(
                EventoMarco.instrumento_id == inst.id,
                EventoMarco.marco_id == marco.id,
                EventoMarco.substituido_por_id.is_(None),
                EventoMarco.deletado_em.is_(None),
            )
        )
        .scalars()
        .all()
    )


def test_aplica_as_regras_e_preserva_aceleradores(db):
    concluido = _instrumento(db, integral=True)
    aberto_realizada = _instrumento(db)
    db.add(
        EventoMarco(
            instrumento_id=aberto_realizada.id, marco_id=_marco(db, MARCO_PREVISAO).id, data_ocorrencia=date(2025, 3, 1)
        )
    )
    aberto_sem_registro = _instrumento(db)
    acelerador = _instrumento(db, integral=True, acelerador=True)
    db.flush()

    simulado, _ = executar(db, aplicar=False)
    assert _ativos(db, concluido, MARCO_DISPENSADA) == []
    assert sum(simulado.values()) >= 4

    contagem, aceleradores = executar(db, aplicar=True)
    db.flush()
    assert len(_ativos(db, concluido, MARCO_DISPENSADA)) == 1
    assert _ativos(db, aberto_realizada, MARCO_PREVISAO) == []
    assert _ativos(db, aberto_sem_registro, MARCO_PREVISAO) == []
    assert _ativos(db, acelerador, MARCO_DISPENSADA) == []
    assert acelerador.nr_convenio in {numero for numero, _ in aceleradores}
    assert contagem["concluído integral sem registro -> dispensada"] == 1

    repetido, _ = executar(db, aplicar=True)
    assert "concluído integral sem registro -> dispensada" not in repetido
