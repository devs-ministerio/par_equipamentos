"""Acesso a dados de Notificacao / NotificacaoDestinatario.

Ver docs/arquitetura/planmode-notificacoes-escopo-2026-09-25.md pra regra
completa de escopo por destinatário.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

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
from app.repositories.convenios import instrumento_no_escopo


@dataclass(frozen=True)
class NotificacaoParaUsuario:
    notificacao: Notificacao
    destinatario_id: int
    lida: bool
    arquivada: bool = False


@dataclass(frozen=True)
class PaginaNotificacoes:
    itens: list[NotificacaoParaUsuario]
    total: int
    nao_lidas: int


def _ids_ativos_por_role(db: Session, roles: tuple[UserRole, ...]) -> set[int]:
    return set(
        db.execute(
            select(User.id).where(User.role.in_(roles), User.status == UserStatus.active, User.deleted_at.is_(None))
        ).scalars()
    )


def _ids_broadcast(db: Session) -> set[int]:
    """Todo colaborador/gestor/admin ativo -- leitor nunca entra."""
    return _ids_ativos_por_role(db, (UserRole.colaborador, UserRole.gestor, UserRole.admin))


def obter_ids_responsaveis_do_instrumento(db: Session, instrumento_id: int) -> set[int]:
    """IDs de usuário vinculados como titular/suplente do instrumento --
    compartilhado entre escopo de notificação (aqui) e autorização por
    titularidade (app.authz, via app.repositories.monitoramento -- não pode
    viver lá porque monitoramento.py já importa deste módulo)."""
    return set(
        db.execute(
            select(InstrumentoResponsavel.usuario_id).where(InstrumentoResponsavel.instrumento_id == instrumento_id)
        ).scalars()
    )


def _ids_titular_suplente_e_gestores(db: Session, instrumento_id: int) -> set[int]:
    ids_designados = obter_ids_responsaveis_do_instrumento(db, instrumento_id)
    if not ids_designados:
        return _ids_broadcast(db)
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
                    User.deleted_at.is_(None),
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

    if tipo in (
        NotificacaoTipo.inclusao_monitoramento,
        NotificacaoTipo.fonte_indisponivel,
        NotificacaoTipo.aprovacao_carteira,
        NotificacaoTipo.convenio_descoberto,
    ):
        return _ids_ativos_por_role(db, (UserRole.gestor, UserRole.admin))

    if tipo == NotificacaoTipo.alerta_vigencia:
        instrumento_id = _instrumento_id_por_convenio_id(db, entidade_id)
        if instrumento_id is None:
            return _ids_broadcast(db)
        return _ids_titular_suplente_e_gestores(db, instrumento_id)

    # atualizacao_api / edicao_manual -- entidade_id é InstrumentoEquipamento.id.
    # Sem titular/suplente cadastrado, cai no broadcast (nunca fica órfã).
    return _ids_titular_suplente_e_gestores(db, entidade_id)


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


def criar_avisos_descoberta(db: Session, avisos: list[Notificacao]) -> None:
    """Insere em lote; destinatários gerenciais resolvidos uma única vez."""
    if not avisos:
        return
    if any(aviso.tipo != NotificacaoTipo.convenio_descoberto for aviso in avisos):
        raise ValueError("Lote de descoberta aceita somente avisos de convênio descoberto.")
    ids = _ids_ativos_por_role(db, (UserRole.gestor, UserRole.admin))
    db.add_all(avisos)
    db.flush()
    db.add_all(
        [
            NotificacaoDestinatario(notificacao_id=aviso.id, usuario_id=usuario_id)
            for aviso in avisos
            for usuario_id in ids
        ]
    )


_TIPOS_DE_INSTRUMENTO = (
    NotificacaoTipo.atualizacao_api,
    NotificacaoTipo.edicao_manual,
    NotificacaoTipo.inclusao_monitoramento,
    NotificacaoTipo.entrega_legada_revisao,
    NotificacaoTipo.prazo_acao,
    NotificacaoTipo.prazo_inauguracao,
)


def notificacao_no_escopo() -> ColumnElement[bool]:
    """Aviso de instrumento ou convênio fora de escopo (só obra, por exemplo) não aparece para ninguém."""
    instrumentos_fora = select(InstrumentoEquipamento.id).where(~instrumento_no_escopo())
    convenios_fora = select(Convenio.id).where(Convenio.fora_escopo_equipamentos.is_(True))
    return ~(
        (Notificacao.tipo.in_(_TIPOS_DE_INSTRUMENTO) & Notificacao.entidade_id.in_(instrumentos_fora))
        | ((Notificacao.tipo == NotificacaoTipo.alerta_vigencia) & Notificacao.entidade_id.in_(convenios_fora))
    )


def listar_notificacoes_paginadas(
    db: Session,
    *,
    usuario_id: int,
    limit: int,
    offset: int,
    apenas_nao_lidas: bool,
    busca: str | None = None,
    tipo: NotificacaoTipo | None = None,
    arquivadas: bool = False,
) -> PaginaNotificacoes:
    base = (
        select(Notificacao, NotificacaoDestinatario.id, NotificacaoDestinatario.lida, NotificacaoDestinatario.arquivada)
        .join(NotificacaoDestinatario, NotificacaoDestinatario.notificacao_id == Notificacao.id)
        .where(
            NotificacaoDestinatario.usuario_id == usuario_id,
            NotificacaoDestinatario.arquivada == arquivadas,
            notificacao_no_escopo(),
        )
    )
    if apenas_nao_lidas:
        base = base.where(NotificacaoDestinatario.lida.is_(False))
    if tipo is not None:
        base = base.where(Notificacao.tipo == tipo)
    if busca:
        termo = busca.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        base = base.where(
            Notificacao.titulo.ilike(f"%{termo}%", escape="\\") | Notificacao.corpo.ilike(f"%{termo}%", escape="\\")
        )

    linhas = db.execute(
        base.order_by(Notificacao.created_at.desc(), Notificacao.id.desc()).limit(limit).offset(offset)
    ).all()
    itens = [
        NotificacaoParaUsuario(notificacao=notificacao, destinatario_id=destinatario_id, lida=lida, arquivada=arquivada)
        for notificacao, destinatario_id, lida, arquivada in linhas
    ]

    contagem_base = (
        select(func.count())
        .select_from(NotificacaoDestinatario)
        .join(Notificacao, Notificacao.id == NotificacaoDestinatario.notificacao_id)
        .where(NotificacaoDestinatario.usuario_id == usuario_id, notificacao_no_escopo())
    )
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    nao_lidas = db.execute(
        contagem_base.where(NotificacaoDestinatario.lida.is_(False), NotificacaoDestinatario.arquivada.is_(False))
    ).scalar_one()

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


def marcar_todas_destinatario_lidas(db: Session, usuario_id: int) -> int:
    alteradas = (
        update(NotificacaoDestinatario)
        .where(
            NotificacaoDestinatario.usuario_id == usuario_id,
            NotificacaoDestinatario.lida.is_(False),
            NotificacaoDestinatario.arquivada.is_(False),
        )
        .values(lida=True, lida_em=datetime.now(UTC))
        .returning(NotificacaoDestinatario.id)
        .cte("lidas")
    )
    return db.execute(select(func.count()).select_from(alteradas)).scalar_one()


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


def mapear_numeros_convenios(db: Session, ids: set[int]) -> dict[int, str]:
    """Identidade oficial da carteira, sem exigir monitoramento interno."""
    if not ids:
        return {}
    return {
        convenio_id: numero
        for convenio_id, numero in db.execute(select(Convenio.id, Convenio.numero).where(Convenio.id.in_(ids)))
    }


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
