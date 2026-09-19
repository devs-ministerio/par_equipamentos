"""Acesso a dados de monitoramento de equipamento -- primeira extração de
query real deste domínio (Bloco 3 do Plan Mode consolidação 2026-09-17),
começando pela fatia de leitura (`listar_instrumentos`/`obter_timeline`),
mais simples que a escrita (eventos/ações têm side effects). Funções soltas
com `db: Session` posicional, nunca comitam -- mesmo contrato provado em
`repositories/notificacoes.py` (padroes/backend/constituicao_backend.md
Seção 3).
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.db.models import AcaoMonitoramento, EventoMarco, InstrumentoEquipamento, MarcoCatalogo, MarcoGrupo, User

# Evento/ação ATIVO = ainda vigente (não corrigido nem excluído) -- ver
# docstring de EventoMarco/AcaoMonitoramento em models.py (Plan Mode
# monitoramento-evolucao 2026-09-19). Só o ativo entra em cálculo de fase,
# timeline e listagens padrão.
_EVENTO_ATIVO = and_(EventoMarco.substituido_por_id.is_(None), EventoMarco.deletado_em.is_(None))
_ACAO_ATIVA = and_(AcaoMonitoramento.substituido_por_id.is_(None), AcaoMonitoramento.deletado_em.is_(None))


def listar_instrumentos(db: Session, *, limit: int = 500) -> list[InstrumentoEquipamento]:
    # Teto de seguranca, nao paginacao de UI (Bloco 4 do Plan Mode
    # consolidacao 2026-09-17) -- universo monitorado e pequeno hoje (86).
    return list(
        db.execute(
            select(InstrumentoEquipamento).order_by(InstrumentoEquipamento.nr_convenio).limit(limit)
        ).scalars().all()
    )


def listar_marcos_fase_geral_desc(db: Session) -> list[MarcoCatalogo]:
    """Ordem decrescente -- o chamador percorre do marco mais avançado pro
    menos avançado até achar o primeiro com evento registrado (fase atual)."""
    return list(
        db.execute(
            select(MarcoCatalogo)
            .where(MarcoCatalogo.grupo == MarcoGrupo.fase_geral)
            .order_by(MarcoCatalogo.ordem.desc())
        )
        .scalars()
        .all()
    )


def mapa_eventos_por_instrumento(db: Session, marco_ids: list[int]) -> dict[int, set[int]]:
    """`{instrumento_id: {marco_id, ...}}` -- só os pares relevantes pros
    `marco_ids` pedidos (fase_geral), não todo `EventoMarco` da tabela
    (universo monitorado é pequeno hoje, mas a query já nasce restrita).
    Só considera evento ATIVO -- um evento corrigido/excluído não pode mais
    empurrar a fase pra frente."""
    eventos_por_instrumento: dict[int, set[int]] = defaultdict(set)
    if marco_ids:
        for instrumento_id, marco_id in db.execute(
            select(EventoMarco.instrumento_id, EventoMarco.marco_id)
            .where(EventoMarco.marco_id.in_(marco_ids), _EVENTO_ATIVO)
        ):
            eventos_por_instrumento[instrumento_id].add(marco_id)
    return eventos_por_instrumento


def obter_instrumento_por_nr_convenio(db: Session, nr_convenio: str) -> InstrumentoEquipamento | None:
    return db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()


def listar_eventos_do_instrumento(
    db: Session, instrumento_id: int, *, apenas_ativos: bool = True
) -> list[EventoMarco]:
    """`apenas_ativos=False` devolve também os corrigidos/excluídos -- uso
    restrito à trilha de auditoria, nunca à timeline padrão.

    Desempate por `id` além de `created_at` (achado 2026-09-19, ao vivo,
    convênio 947527): cargas em lote gravam vários eventos do mesmo marco
    com o MESMO `created_at` (timestamp do processo, não do evento) --
    sem desempate, a ordem de retorno do Postgres pra empate não é
    garantida, e o front pode achar que "o mais recente" é qualquer um
    deles. `id` cresce sempre na ordem real de inserção, então serve de
    desempate determinístico -- mesmo critério já usado em
    `obter_evento_mais_recente_do_marco` abaixo."""
    stmt = select(EventoMarco).where(EventoMarco.instrumento_id == instrumento_id)
    if apenas_ativos:
        stmt = stmt.where(_EVENTO_ATIVO)
    return list(
        db.execute(stmt.order_by(EventoMarco.created_at.desc(), EventoMarco.id.desc())).scalars().all()
    )


def obter_evento_mais_recente_do_marco(
    db: Session,
    *,
    instrumento_id: int,
    marco_id: int,
) -> EventoMarco | None:
    """Só entre os ATIVOS -- reprogramação/justificativa compara contra o
    que está vigente, não contra um lançamento já corrigido."""
    return db.execute(
        select(EventoMarco)
        .where(EventoMarco.instrumento_id == instrumento_id, EventoMarco.marco_id == marco_id, _EVENTO_ATIVO)
        .order_by(EventoMarco.created_at.desc(), EventoMarco.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def obter_evento_por_id(db: Session, evento_id: int) -> EventoMarco | None:
    return db.get(EventoMarco, evento_id)


def obter_acao_por_id(db: Session, acao_id: int) -> AcaoMonitoramento | None:
    return db.get(AcaoMonitoramento, acao_id)


def resolver_nomes_usuarios(db: Session, ids: Iterable[int | None]) -> dict[int, str]:
    """`{user_id: name}` pros ids pedidos -- usado pra montar `autor_nome`/
    `atualizado_por_nome`/`deletado_por_nome` sem N+1 query por evento/ação.
    Aceita ids `None` na entrada (comum quando o campo é opcional no
    chamador) -- só filtra, nunca falha."""
    ids_validos = {i for i in ids if i is not None}
    if not ids_validos:
        return {}
    return {row[0]: row[1] for row in db.execute(select(User.id, User.name).where(User.id.in_(ids_validos)))}
