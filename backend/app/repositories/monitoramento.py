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

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo, MarcoGrupo


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
    (universo monitorado é pequeno hoje, mas a query já nasce restrita)."""
    eventos_por_instrumento: dict[int, set[int]] = defaultdict(set)
    if marco_ids:
        for instrumento_id, marco_id in db.execute(
            select(EventoMarco.instrumento_id, EventoMarco.marco_id).where(EventoMarco.marco_id.in_(marco_ids))
        ):
            eventos_por_instrumento[instrumento_id].add(marco_id)
    return eventos_por_instrumento


def obter_instrumento_por_nr_convenio(db: Session, nr_convenio: str) -> InstrumentoEquipamento | None:
    return db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()


def listar_eventos_do_instrumento(db: Session, instrumento_id: int) -> list[EventoMarco]:
    return list(
        db.execute(
            select(EventoMarco)
            .where(EventoMarco.instrumento_id == instrumento_id)
            .order_by(EventoMarco.created_at.desc())
        )
        .scalars()
        .all()
    )
