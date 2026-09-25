"""Acesso a dados de Notificacao / NotificacaoDestinatario.

Ver docs/arquitetura/planmode-notificacoes-escopo-2026-09-25.md pra regra
completa de escopo por destinatário.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Convenio,
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
    PropostaCandidata,
    User,
    UserRole,
    UserStatus,
)


@dataclass(frozen=True)
class NotificacaoParaUsuario:
    notificacao: Notificacao
    destinatario_id: int
    lida: bool


@dataclass(frozen=True)
class PaginaNotificacoes:
    itens: list[NotificacaoParaUsuario]
    total: int
    nao_lidas: int


def _ids_ativos_por_role(db: Session, roles: tuple[UserRole, ...]) -> set[int]:
    return set(db.execute(select(User.id).where(User.role.in_(roles), User.status == UserStatus.active)).scalars())


def _ids_broadcast(db: Session) -> set[int]:
    """Todo colaborador/gestor/admin ativo -- leitor nunca entra."""
    return _ids_ativos_por_role(db, (UserRole.colaborador, UserRole.gestor, UserRole.admin))


def _ids_titular_suplente_e_gestores(db: Session, instrumento_id: int) -> set[int]:
    ids_designados = set(
        db.execute(
            select(InstrumentoResponsavel.usuario_id).where(InstrumentoResponsavel.instrumento_id == instrumento_id)
        ).scalars()
    )
    # Filtra por ativo E role != leitor -- titular/suplente designado que foi
    # inativado (módulo de gestão de usuários) ou é leitor (decisão do
    # usuário 2026-09-25: leitor nunca recebe notificação, mesmo sendo
    # titular/suplente hipoteticamente) não deve seguir recebendo.
    titular_suplente: set[int] = set()
    if ids_designados:
        titular_suplente = set(
            db.execute(
                select(User.id).where(
                    User.id.in_(ids_designados),
                    User.status == UserStatus.active,
                    User.role != UserRole.leitor,
                )
            ).scalars()
        )
    gestores = _ids_ativos_por_role(db, (UserRole.gestor, UserRole.admin))
    return titular_suplente | gestores


def _instrumento_id_por_convenio_id(db: Session, convenio_id: int) -> int | None:
    numero = db.execute(select(Convenio.numero).where(Convenio.id == convenio_id)).scalar_one_or_none()
    if numero is None:
        return None
    return db.execute(
        select(InstrumentoEquipamento.id).where(InstrumentoEquipamento.nr_convenio == numero)
    ).scalar_one_or_none()


def resolver_destinatarios(db: Session, *, tipo: NotificacaoTipo, entidade_id: int) -> set[int]:
    """Quem deve ver uma Notificacao desse tipo/entidade -- chamado 1x no
    momento da criação (ver `criar_notificacao` abaixo), nunca em tempo de
    leitura. `leitor` nunca entra em nenhum branch."""
    if tipo == NotificacaoTipo.proposta_candidata:
        return _ids_broadcast(db)

    if tipo == NotificacaoTipo.alerta_vigencia:
        instrumento_id = _instrumento_id_por_convenio_id(db, entidade_id)
        if instrumento_id is None:
            return _ids_broadcast(db)
        return _ids_titular_suplente_e_gestores(db, instrumento_id)

    # atualizacao_api / edicao_manual -- entidade_id é InstrumentoEquipamento.id.
    # Sem titular/suplente cadastrado, cai no broadcast (nunca fica órfã).
    ids = _ids_titular_suplente_e_gestores(db, entidade_id)
    return ids if ids else _ids_broadcast(db)


def criar_notificacao(db: Session, notificacao: Notificacao) -> Notificacao:
    """Insere a Notificacao e materializa NotificacaoDestinatario pra cada
    usuário que deve vê-la. `db.add`+`flush` (não commit) -- quem chama
    continua responsável pelo commit, mesmo padrão já usado pelos jobs/
    services que antes só faziam `db.add(Notificacao(...))` direto."""
    db.add(notificacao)
    db.flush()
    destinatarios = resolver_destinatarios(db, tipo=notificacao.tipo, entidade_id=notificacao.entidade_id)
    for usuario_id in destinatarios:
        db.add(NotificacaoDestinatario(notificacao_id=notificacao.id, usuario_id=usuario_id))
    return notificacao


def listar_notificacoes_paginadas(
    db: Session,
    *,
    usuario_id: int,
    limit: int,
    offset: int,
    apenas_nao_lidas: bool,
) -> PaginaNotificacoes:
    base = (
        select(Notificacao, NotificacaoDestinatario.id, NotificacaoDestinatario.lida)
        .join(NotificacaoDestinatario, NotificacaoDestinatario.notificacao_id == Notificacao.id)
        .where(NotificacaoDestinatario.usuario_id == usuario_id)
    )
    if apenas_nao_lidas:
        base = base.where(NotificacaoDestinatario.lida.is_(False))

    linhas = db.execute(base.order_by(Notificacao.created_at.desc()).limit(limit).offset(offset)).all()
    itens = [
        NotificacaoParaUsuario(notificacao=notificacao, destinatario_id=destinatario_id, lida=lida)
        for notificacao, destinatario_id, lida in linhas
    ]

    contagem_base = (
        select(func.count())
        .select_from(NotificacaoDestinatario)
        .where(NotificacaoDestinatario.usuario_id == usuario_id)
    )
    total = db.execute(contagem_base).scalar_one()
    nao_lidas = db.execute(contagem_base.where(NotificacaoDestinatario.lida.is_(False))).scalar_one()

    return PaginaNotificacoes(itens=itens, total=total, nao_lidas=nao_lidas)


def obter_destinatario(db: Session, *, notificacao_id: int, usuario_id: int) -> NotificacaoDestinatario | None:
    return db.execute(
        select(NotificacaoDestinatario).where(
            NotificacaoDestinatario.notificacao_id == notificacao_id,
            NotificacaoDestinatario.usuario_id == usuario_id,
        )
    ).scalar_one_or_none()


def obter_notificacao(db: Session, notificacao_id: int) -> Notificacao | None:
    return db.execute(select(Notificacao).where(Notificacao.id == notificacao_id)).scalar_one_or_none()


def marcar_destinatario_lido(db: Session, destinatario: NotificacaoDestinatario) -> NotificacaoDestinatario:
    if not destinatario.lida:
        destinatario.lida = True
        destinatario.lida_em = datetime.now(UTC)
    return destinatario


def mapear_identificadores_instrumentos(db: Session, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    return {
        instrumento_id: nr_convenio
        for instrumento_id, nr_convenio in db.execute(
            select(InstrumentoEquipamento.id, InstrumentoEquipamento.nr_convenio).where(
                InstrumentoEquipamento.id.in_(ids)
            )
        )
    }


def mapear_ids_propostas(db: Session, ids: set[int]) -> set[int]:
    if not ids:
        return set()
    return set(db.execute(select(PropostaCandidata.id).where(PropostaCandidata.id.in_(ids))).scalars())


def mapear_convenios_monitorados(db: Session, ids: set[int]) -> dict[int, str]:
    """Convenio.id -> InstrumentoEquipamento.nr_convenio, só quando o
    convênio tem monitoramento interno (join por Convenio.numero ==
    InstrumentoEquipamento.nr_convenio) -- usado pra resolver destino de
    tipo=alerta_vigencia. Sem monitoramento, o id não aparece no dict (o
    service trata como destino=None, mesmo critério já usado quando
    `identificador` não é encontrado nos outros tipos)."""
    if not ids:
        return {}
    return {
        convenio_id: nr_convenio
        for convenio_id, nr_convenio in db.execute(
            select(Convenio.id, InstrumentoEquipamento.nr_convenio)
            .join(InstrumentoEquipamento, InstrumentoEquipamento.nr_convenio == Convenio.numero)
            .where(Convenio.id.in_(ids))
        )
    }
