"""Acesso a dados da conclusão do acompanhamento. Funções soltas, sem commit."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AcaoMonitoramento, ConclusaoInstrumento, ItemPlano

LIMITE_ACOES = 50


def obter_ativa(db: Session, instrumento_id: int) -> ConclusaoInstrumento | None:
    return db.scalars(
        select(ConclusaoInstrumento).where(
            ConclusaoInstrumento.instrumento_id == instrumento_id, ConclusaoInstrumento.deletado_em.is_(None)
        )
    ).first()


def datas_conclusao_ativas(db: Session, instrumento_ids: Sequence[int]) -> dict[int, date]:
    """Data da conclusão confirmada vigente de cada instrumento (os sem conclusão ficam de fora)."""
    if not instrumento_ids:
        return {}
    linhas = db.execute(
        select(ConclusaoInstrumento.instrumento_id, ConclusaoInstrumento.data_conclusao).where(
            ConclusaoInstrumento.instrumento_id.in_(instrumento_ids), ConclusaoInstrumento.deletado_em.is_(None)
        )
    )
    return {instrumento_id: data for instrumento_id, data in linhas}


def existe_ativa(db: Session, instrumento_id: int) -> bool:
    return obter_ativa(db, instrumento_id) is not None


def adicionar(db: Session, conclusao: ConclusaoInstrumento) -> None:
    db.add(conclusao)
    db.flush()


def listar_acoes_abertas(db: Session, instrumento_id: int) -> list[AcaoMonitoramento]:
    return list(
        db.scalars(
            select(AcaoMonitoramento)
            .where(
                AcaoMonitoramento.instrumento_id == instrumento_id,
                AcaoMonitoramento.data_conclusao.is_(None),
                AcaoMonitoramento.deletado_em.is_(None),
                AcaoMonitoramento.substituido_por_id.is_(None),
            )
            .order_by(AcaoMonitoramento.data_prevista.nulls_last(), AcaoMonitoramento.id)
            .limit(LIMITE_ACOES)
        )
    )


def contar_acoes_abertas(db: Session, instrumento_id: int) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(AcaoMonitoramento)
            .where(
                AcaoMonitoramento.instrumento_id == instrumento_id,
                AcaoMonitoramento.data_conclusao.is_(None),
                AcaoMonitoramento.deletado_em.is_(None),
                AcaoMonitoramento.substituido_por_id.is_(None),
            )
        ).scalar_one()
    )


def contar_itens_em_revisao(db: Session, instrumento_id: int) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(ItemPlano)
            .where(
                ItemPlano.instrumento_id == instrumento_id,
                ItemPlano.ativo.is_(True),
                ItemPlano.situacao_classificacao == "pendente",
            )
        ).scalar_one()
    )


def ids_com_conclusao_ativa(db: Session, instrumento_ids: list[int]) -> set[int]:
    if not instrumento_ids:
        return set()
    return set(
        db.scalars(
            select(ConclusaoInstrumento.instrumento_id).where(
                ConclusaoInstrumento.instrumento_id.in_(instrumento_ids), ConclusaoInstrumento.deletado_em.is_(None)
            )
        )
    )
