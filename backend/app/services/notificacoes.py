"""Casos de uso de notificações do Radar de Convênios."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.models import Notificacao, NotificacaoTipo
from app.domain_errors import NotFoundError
from app.repositories.notificacoes import (
    listar_notificacoes_paginadas,
    mapear_identificadores_instrumentos,
    mapear_ids_propostas,
    obter_notificacao,
)


@dataclass(frozen=True)
class NotificacaoComDestino:
    notificacao: Notificacao
    destino: str | None


@dataclass(frozen=True)
class PaginaNotificacoesComDestino:
    itens: list[NotificacaoComDestino]
    total: int
    nao_lidas: int


def listar_notificacoes(
    *,
    db: Session,
    limit: int,
    offset: int,
    apenas_nao_lidas: bool,
) -> PaginaNotificacoesComDestino:
    """Contagem de nao lidas SEMPRE sobre o total (ignora `apenas_nao_lidas`/
    paginacao) -- e o numero que alimenta o badge do menu, precisa ser
    estavel independente do filtro da lista que o usuario esta vendo."""
    pagina = listar_notificacoes_paginadas(db, limit=limit, offset=offset, apenas_nao_lidas=apenas_nao_lidas)
    ids_instrumentos = {n.entidade_id for n in pagina.itens if n.tipo != NotificacaoTipo.proposta_candidata}
    ids_propostas = {n.entidade_id for n in pagina.itens if n.tipo == NotificacaoTipo.proposta_candidata}
    instrumentos = mapear_identificadores_instrumentos(db, ids_instrumentos)
    propostas = mapear_ids_propostas(db, ids_propostas)
    itens = []
    for notificacao in pagina.itens:
        if notificacao.tipo == NotificacaoTipo.proposta_candidata:
            destino = (
                "/monitoramento-equipamentos?aba=componentes&subaba=novas"
                if notificacao.entidade_id in propostas
                else None
            )
        else:
            identificador = instrumentos.get(notificacao.entidade_id)
            destino = f"/monitoramento-equipamentos/instrumentos/{identificador}" if identificador else None
        itens.append(NotificacaoComDestino(notificacao=notificacao, destino=destino))
    return PaginaNotificacoesComDestino(itens=itens, total=pagina.total, nao_lidas=pagina.nao_lidas)


def marcar_notificacao_lida(*, db: Session, notificacao_id: int) -> Notificacao:
    notificacao = obter_notificacao(db, notificacao_id)
    if notificacao is None:
        raise NotFoundError(f"Notificação {notificacao_id} não encontrada.")
    notificacao.lida = True
    db.commit()
    db.refresh(notificacao)
    return notificacao
