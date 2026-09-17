"""Casos de uso de notificações do Radar de Convênios."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import Notificacao
from app.domain_errors import NotFoundError
from app.repositories.notificacoes import PaginaNotificacoes, listar_notificacoes_paginadas, obter_notificacao


def listar_notificacoes(
    *,
    db: Session,
    limit: int,
    offset: int,
    apenas_nao_lidas: bool,
) -> PaginaNotificacoes:
    """Contagem de nao lidas SEMPRE sobre o total (ignora `apenas_nao_lidas`/
    paginacao) -- e o numero que alimenta o badge do menu, precisa ser
    estavel independente do filtro da lista que o usuario esta vendo."""
    return listar_notificacoes_paginadas(db, limit=limit, offset=offset, apenas_nao_lidas=apenas_nao_lidas)


def marcar_notificacao_lida(*, db: Session, notificacao_id: int) -> Notificacao:
    notificacao = obter_notificacao(db, notificacao_id)
    if notificacao is None:
        raise NotFoundError(f"Notificação {notificacao_id} não encontrada.")
    notificacao.lida = True
    db.commit()
    db.refresh(notificacao)
    return notificacao
