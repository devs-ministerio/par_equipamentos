"""Consultas de repasse e dos fatos que calculam a fase do acompanhamento. Não commita."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.db.models import (
    Convenio,
    EntregaEquipamento,
    EventoMarco,
    MarcoCatalogo,
    RepasseInstrumento,
)

CODIGOS_AQUISICAO = (
    "fase_em_licitacao",
    "fase_equipamento_em_aquisicao",
    "fase_contratado",
    "fase_em_andamento",
    "fase_comissionamento",
)
CODIGO_AGUARDANDO_REPASSE = "fase_aguardando_repasse"
CODIGO_CONCLUIDO = "fase_concluido"
# Eventos de cronograma que, uma vez realizados (com data de ocorrência), iniciam o pós-entrega.
CODIGOS_POS_ENTREGA = (
    "cronograma_instalacao_inicio",
    "cronograma_instalacao_fim",
    "cronograma_comissionamento",
)

_REPASSE_ATIVO = (RepasseInstrumento.deletado_em.is_(None), RepasseInstrumento.substituido_por_id.is_(None))


def listar_repasses_ativos(db: Session, instrumento_id: int) -> list[RepasseInstrumento]:
    return list(
        db.execute(
            select(RepasseInstrumento)
            .where(RepasseInstrumento.instrumento_id == instrumento_id, *_REPASSE_ATIVO)
            .order_by(RepasseInstrumento.id)
        ).scalars()
    )


def adicionar_repasse(db: Session, repasse: RepasseInstrumento) -> RepasseInstrumento:
    db.add(repasse)
    db.flush()
    return repasse


def encerrar_repasse(db: Session, repasse: RepasseInstrumento, *, agora: datetime, motivo: str) -> None:
    """Tira o repasse da vigência antes de inserir o substituto (o índice único só admite um ativo)."""
    repasse.deletado_em = agora
    repasse.motivo_exclusao = motivo
    db.flush()


def ligar_substituto(db: Session, antigo: RepasseInstrumento, novo: RepasseInstrumento) -> None:
    antigo.substituido_por_id = novo.id
    db.flush()


def obter_valor_repasse_previsto(db: Session, nr_convenio: str) -> float | None:
    valor = db.execute(select(Convenio.valor_repasse).where(Convenio.numero == nr_convenio)).scalar_one_or_none()
    return float(valor) if valor is not None else None


def obter_desembolsos_siconv(db: Session, nr_convenio: str) -> list[dict]:
    bruto = db.execute(select(Convenio.siconv_raw).where(Convenio.numero == nr_convenio)).scalar_one_or_none()
    desembolsos = (bruto or {}).get("desembolsos") or []
    return [d for d in desembolsos if isinstance(d, dict)]


def existe_entrega_ativa(db: Session, instrumento_id: int) -> bool:
    return bool(
        db.execute(
            select(
                exists().where(
                    EntregaEquipamento.instrumento_id == instrumento_id,
                    EntregaEquipamento.deletado_em.is_(None),
                    EntregaEquipamento.substituido_por_id.is_(None),
                )
            )
        ).scalar()
    )


def existe_evento_ativo_de_marcos(db: Session, instrumento_id: int, codigos: tuple[str, ...]) -> bool:
    return bool(
        db.execute(
            select(
                exists().where(
                    EventoMarco.instrumento_id == instrumento_id,
                    EventoMarco.substituido_por_id.is_(None),
                    EventoMarco.deletado_em.is_(None),
                    EventoMarco.marco_id.in_(select(MarcoCatalogo.id).where(MarcoCatalogo.codigo.in_(codigos))),
                )
            )
        ).scalar()
    )


def existe_evento_realizado_de_marcos(db: Session, instrumento_id: int, codigos: tuple[str, ...]) -> bool:
    """Como `existe_evento_ativo_de_marcos`, mas só conta evento com data de ocorrência (aconteceu)."""
    return bool(
        db.execute(
            select(
                exists().where(
                    EventoMarco.instrumento_id == instrumento_id,
                    EventoMarco.substituido_por_id.is_(None),
                    EventoMarco.deletado_em.is_(None),
                    EventoMarco.data_ocorrencia.is_not(None),
                    EventoMarco.marco_id.in_(select(MarcoCatalogo.id).where(MarcoCatalogo.codigo.in_(codigos))),
                )
            )
        ).scalar()
    )
