"""Casos de uso de notificações (Radar de Convênios + monitoramento interno +
alerta de vigência). Ver docs/arquitetura/planmode-notificacoes-escopo-2026-09-25.md."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.models import Notificacao, NotificacaoTipo
from app.domain_errors import NotFoundError
from app.repositories.notificacoes import (
    listar_notificacoes_paginadas,
    mapear_convenios_monitorados,
    mapear_identificadores_instrumentos,
    mapear_ids_propostas,
    marcar_destinatario_lido,
    marcar_todas_destinatario_lidas,
    obter_destinatario,
    obter_notificacao,
)


@dataclass(frozen=True)
class NotificacaoComDestino:
    notificacao: Notificacao
    destino: str | None
    lida: bool
    arquivada: bool = False


@dataclass(frozen=True)
class PaginaNotificacoesComDestino:
    itens: list[NotificacaoComDestino]
    total: int
    nao_lidas: int


def corpo_publico_da_notificacao(notificacao: Notificacao) -> str | None:
    # Avisos de captura antigos podem ter sido gravados com a exceção crua.
    # Não alterar a evidência persistida; excluir detalhes na fronteira pública.
    if notificacao.tipo == NotificacaoTipo.fonte_indisponivel:
        return "A coleta da fonte falhou ou ficou incompleta. Os últimos dados confirmados foram mantidos."
    return notificacao.corpo


def listar_notificacoes(
    *,
    db: Session,
    usuario_id: int,
    limit: int,
    offset: int,
    apenas_nao_lidas: bool,
    busca: str | None = None,
    tipo: NotificacaoTipo | None = None,
    arquivadas: bool = False,
) -> PaginaNotificacoesComDestino:
    """Escopada por destinatário (Plan Mode notificacoes-escopo 2026-09-25) --
    só devolve o que `NotificacaoDestinatario` materializou pra esse usuário
    no momento da criação. Contagem de não lidas SEMPRE sobre o total do
    usuário (ignora `apenas_nao_lidas`/paginação) -- é o número que alimenta
    o badge do menu, precisa ser estável independente do filtro da lista que
    o usuário está vendo."""
    pagina = listar_notificacoes_paginadas(
        db,
        usuario_id=usuario_id,
        limit=limit,
        offset=offset,
        apenas_nao_lidas=apenas_nao_lidas,
        busca=busca,
        tipo=tipo,
        arquivadas=arquivadas,
    )
    ids_instrumentos = {
        item.notificacao.entidade_id
        for item in pagina.itens
        if item.notificacao.tipo
        in (
            NotificacaoTipo.atualizacao_api,
            NotificacaoTipo.edicao_manual,
            NotificacaoTipo.inclusao_monitoramento,
        )
    }
    ids_propostas = {
        item.notificacao.entidade_id
        for item in pagina.itens
        if item.notificacao.tipo == NotificacaoTipo.proposta_candidata
    }
    ids_convenios = {
        item.notificacao.entidade_id
        for item in pagina.itens
        if item.notificacao.tipo == NotificacaoTipo.alerta_vigencia
    }
    instrumentos = mapear_identificadores_instrumentos(db, ids_instrumentos)
    propostas = mapear_ids_propostas(db, ids_propostas)
    convenios_monitorados = mapear_convenios_monitorados(db, ids_convenios)

    itens = []
    for item in pagina.itens:
        notificacao = item.notificacao
        if notificacao.tipo == NotificacaoTipo.proposta_candidata:
            destino = (
                "/monitoramento-equipamentos?aba=componentes&subaba=novas"
                if notificacao.entidade_id in propostas
                else None
            )
        elif notificacao.tipo == NotificacaoTipo.fonte_indisponivel:
            destino = None
        elif notificacao.tipo == NotificacaoTipo.alerta_vigencia:
            identificador = convenios_monitorados.get(notificacao.entidade_id)
            destino = f"/monitoramento-equipamentos/instrumentos/{identificador}" if identificador else None
        else:
            identificador = instrumentos.get(notificacao.entidade_id)
            destino = f"/monitoramento-equipamentos/instrumentos/{identificador}" if identificador else None
        itens.append(
            NotificacaoComDestino(notificacao=notificacao, destino=destino, lida=item.lida, arquivada=item.arquivada)
        )
    return PaginaNotificacoesComDestino(itens=itens, total=pagina.total, nao_lidas=pagina.nao_lidas)


def marcar_notificacao_lida(*, db: Session, notificacao_id: int, usuario_id: int) -> NotificacaoComDestino:
    destinatario = obter_destinatario(db, notificacao_id=notificacao_id, usuario_id=usuario_id)
    if destinatario is None:
        raise NotFoundError(f"Notificação {notificacao_id} não encontrada para este usuário.")
    marcar_destinatario_lido(db, destinatario)
    db.commit()
    db.refresh(destinatario)
    notificacao = obter_notificacao(db, notificacao_id)
    assert notificacao is not None  # garantido pela FK notificacao_destinatario.notificacao_id
    return NotificacaoComDestino(
        notificacao=notificacao, destino=None, lida=destinatario.lida, arquivada=destinatario.arquivada
    )


def marcar_todas_lidas(*, db: Session, usuario_id: int) -> int:
    quantidade = marcar_todas_destinatario_lidas(db, usuario_id)
    db.commit()
    return quantidade


def arquivar_notificacao(
    *, db: Session, usuario_id: int, notificacao_id: int, arquivada: bool
) -> NotificacaoComDestino:
    destinatario = obter_destinatario(db, notificacao_id=notificacao_id, usuario_id=usuario_id)
    if destinatario is None:
        raise NotFoundError("Notificação não encontrada para este usuário.")
    destinatario.arquivada = arquivada
    db.commit()
    notificacao = obter_notificacao(db, notificacao_id)
    assert notificacao is not None
    return NotificacaoComDestino(
        notificacao=notificacao, destino=None, lida=destinatario.lida, arquivada=destinatario.arquivada
    )
