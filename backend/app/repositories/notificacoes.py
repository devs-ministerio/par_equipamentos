"""Acesso a dados de Notificacao."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import InstrumentoEquipamento, Notificacao, PropostaCandidata


@dataclass(frozen=True)
class PaginaNotificacoes:
    itens: list[Notificacao]
    total: int
    nao_lidas: int


def listar_notificacoes_paginadas(
    db: Session,
    *,
    limit: int,
    offset: int,
    apenas_nao_lidas: bool,
) -> PaginaNotificacoes:
    base = select(Notificacao)
    if apenas_nao_lidas:
        base = base.where(Notificacao.lida.is_(False))

    itens = db.execute(
        base.order_by(Notificacao.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all()
    total = db.execute(select(func.count()).select_from(Notificacao)).scalar_one()
    nao_lidas = db.execute(
        select(func.count()).select_from(Notificacao).where(Notificacao.lida.is_(False))
    ).scalar_one()

    return PaginaNotificacoes(itens=list(itens), total=total, nao_lidas=nao_lidas)


def obter_notificacao(db: Session, notificacao_id: int) -> Notificacao | None:
    return db.execute(select(Notificacao).where(Notificacao.id == notificacao_id)).scalar_one_or_none()


def mapear_identificadores_instrumentos(db: Session, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    return {instrumento_id: nr_convenio for instrumento_id, nr_convenio in db.execute(
        select(InstrumentoEquipamento.id, InstrumentoEquipamento.nr_convenio)
        .where(InstrumentoEquipamento.id.in_(ids))
    )}


def mapear_ids_propostas(db: Session, ids: set[int]) -> set[int]:
    if not ids:
        return set()
    return set(db.execute(select(PropostaCandidata.id).where(PropostaCandidata.id.in_(ids))).scalars())
