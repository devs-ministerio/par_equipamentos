"""Datas das etapas de cada instrumento (publicação, entrega, conclusão) e inauguração dispensada.

Só leitura, para os dashboards de prazo do Painel de gestão. Função solta com `db` posicional, nunca commita.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    ConclusaoInstrumento,
    Convenio,
    EntregaEquipamento,
    EventoMarco,
    MarcoCatalogo,
    UnidadeEquipamento,
)

MARCO_DISPENSADA = "cronograma_inauguracao_dispensada"


def publicacoes_por_numero(db: Session, numeros: Sequence[str]) -> dict[str, date]:
    if not numeros:
        return {}
    linhas = db.execute(
        select(Convenio.numero, Convenio.data_publicacao).where(
            Convenio.numero.in_(numeros), Convenio.data_publicacao.is_not(None)
        )
    )
    return {numero: data for numero, data in linhas}


def primeira_entrega_por_instrumento(db: Session, instrumento_ids: Sequence[int]) -> dict[int, date]:
    if not instrumento_ids:
        return {}
    linhas = db.execute(
        select(EntregaEquipamento.instrumento_id, func.min(EntregaEquipamento.data_ocorrencia))
        .where(
            EntregaEquipamento.instrumento_id.in_(instrumento_ids),
            EntregaEquipamento.substituido_por_id.is_(None),
            EntregaEquipamento.deletado_em.is_(None),
        )
        .group_by(EntregaEquipamento.instrumento_id)
    )
    return {instrumento_id: data for instrumento_id, data in linhas}


def ids_com_inauguracao_dispensada(db: Session, instrumento_ids: Sequence[int]) -> set[int]:
    if not instrumento_ids:
        return set()
    linhas = db.execute(
        select(EventoMarco.instrumento_id)
        .join(MarcoCatalogo, MarcoCatalogo.id == EventoMarco.marco_id)
        .where(
            MarcoCatalogo.codigo == MARCO_DISPENSADA,
            EventoMarco.instrumento_id.in_(instrumento_ids),
            EventoMarco.substituido_por_id.is_(None),
            EventoMarco.deletado_em.is_(None),
        )
    )
    return {instrumento_id for (instrumento_id,) in linhas}


def resultado_conclusao_por_instrumento(db: Session, instrumento_ids: Sequence[int]) -> dict[int, str]:
    if not instrumento_ids:
        return {}
    linhas = db.execute(
        select(ConclusaoInstrumento.instrumento_id, ConclusaoInstrumento.resultado).where(
            ConclusaoInstrumento.instrumento_id.in_(instrumento_ids), ConclusaoInstrumento.deletado_em.is_(None)
        )
    )
    return {instrumento_id: resultado for instrumento_id, resultado in linhas}


def unidades_entregues_por_data(db: Session, instrumento_ids: Sequence[int]) -> dict[int, list[tuple[date, int]]]:
    """Unidades de equipamento entregues (entregas ativas) agrupadas pela data da entrega, por instrumento."""
    if not instrumento_ids:
        return {}
    linhas = db.execute(
        select(
            EntregaEquipamento.instrumento_id,
            EntregaEquipamento.data_ocorrencia,
            func.count(UnidadeEquipamento.id),
        )
        .join(UnidadeEquipamento, UnidadeEquipamento.entrega_id == EntregaEquipamento.id)
        .where(
            EntregaEquipamento.instrumento_id.in_(instrumento_ids),
            EntregaEquipamento.substituido_por_id.is_(None),
            EntregaEquipamento.deletado_em.is_(None),
        )
        .group_by(EntregaEquipamento.instrumento_id, EntregaEquipamento.data_ocorrencia)
        .order_by(EntregaEquipamento.instrumento_id, EntregaEquipamento.data_ocorrencia)
    )
    resultado: dict[int, list[tuple[date, int]]] = {}
    for instrumento_id, data, quantidade in linhas:
        resultado.setdefault(instrumento_id, []).append((data, int(quantidade)))
    return resultado
