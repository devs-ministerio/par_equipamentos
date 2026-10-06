"""Consultas de histórico das fontes; sem commit ou regra de frescor."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import FonteCaptura, Notificacao, NotificacaoTipo


def adicionar_captura(db: Session, registro: FonteCaptura) -> None:
    db.add(registro)
    db.flush()


def existe_alerta_recente(db: Session, fonte: str, desde: datetime) -> bool:
    return bool(
        db.scalar(
            select(func.count())
            .select_from(Notificacao)
            .join(FonteCaptura, FonteCaptura.id == Notificacao.entidade_id)
            .where(
                Notificacao.tipo == NotificacaoTipo.fonte_indisponivel,
                FonteCaptura.fonte == fonte,
                Notificacao.created_at >= desde,
            )
        )
    )


def listar_ultimas_tentativas(db: Session) -> list[FonteCaptura]:
    # O ID desempata duas tentativas finalizadas no mesmo instante.
    ranking = select(
        FonteCaptura.id,
        func.row_number()
        .over(
            partition_by=FonteCaptura.fonte,
            order_by=(FonteCaptura.finalizado_em.desc(), FonteCaptura.id.desc()),
        )
        .label("posicao"),
    ).subquery()
    return list(
        db.scalars(
            select(FonteCaptura)
            .join(ranking, ranking.c.id == FonteCaptura.id)
            .where(ranking.c.posicao == 1)
            .order_by(FonteCaptura.fonte)
            .limit(50)
        )
    )


def listar_ultimos_sucessos(db: Session, fontes: list[str]) -> dict[str, datetime]:
    return {
        fonte: finalizado
        for fonte, finalizado in db.execute(
            select(FonteCaptura.fonte, func.max(FonteCaptura.finalizado_em))
            .where(FonteCaptura.status == "ok", FonteCaptura.fonte.in_(fontes))
            .group_by(FonteCaptura.fonte)
        ).all()
    }
