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
