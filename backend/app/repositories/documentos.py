"""Acesso a dados de `documento_instrumento`. Funções soltas, sem commit."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import DocumentoInstrumento

_ATIVO = (DocumentoInstrumento.substituido_por_id.is_(None), DocumentoInstrumento.deletado_em.is_(None))
LIMITE_LISTAGEM = 500


def listar_ativos(db: Session, instrumento_id: int) -> list[DocumentoInstrumento]:
    return list(
        db.scalars(
            select(DocumentoInstrumento)
            .where(DocumentoInstrumento.instrumento_id == instrumento_id, *_ATIVO)
            .order_by(DocumentoInstrumento.data_documento.desc(), DocumentoInstrumento.id.desc())
            .limit(LIMITE_LISTAGEM)
        )
    )


def obter(db: Session, documento_id: int) -> DocumentoInstrumento | None:
    return db.get(DocumentoInstrumento, documento_id)


def adicionar(db: Session, documento: DocumentoInstrumento) -> None:
    db.add(documento)
    db.flush()


def licencas_deferidas_por_instrumento(db: Session, instrumento_ids: list[int]) -> dict[int, DocumentoInstrumento]:
    """Registro interno: licença de operação deferida e ativa mais recente de cada instrumento (fallback sem ANSN)."""
    if not instrumento_ids:
        return {}
    resultado: dict[int, DocumentoInstrumento] = {}
    for documento in db.scalars(
        select(DocumentoInstrumento)
        .where(
            DocumentoInstrumento.instrumento_id.in_(instrumento_ids),
            DocumentoInstrumento.tipo == "cnen_licenca",
            DocumentoInstrumento.status == "Deferido",
            *_ATIVO,
        )
        .order_by(DocumentoInstrumento.data_documento.desc(), DocumentoInstrumento.id.desc())
    ):
        resultado.setdefault(documento.instrumento_id, documento)
    return resultado
