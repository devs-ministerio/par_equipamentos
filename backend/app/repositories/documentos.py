"""Acesso a dados de `documento_instrumento`. Funções soltas, sem commit."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import DocumentoInstrumento, EquipamentoCatalogo, ItemPlano

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


def licencas_ativas_por_item(db: Session, instrumento_id: int) -> dict[int, DocumentoInstrumento]:
    """Licença de operação mais recente (por data do documento) de cada item do instrumento."""
    resultado: dict[int, DocumentoInstrumento] = {}
    for documento in db.scalars(
        select(DocumentoInstrumento)
        .where(
            DocumentoInstrumento.instrumento_id == instrumento_id,
            DocumentoInstrumento.tipo == "cnen_licenca",
            DocumentoInstrumento.item_plano_id.is_not(None),
            *_ATIVO,
        )
        .order_by(DocumentoInstrumento.data_documento.desc(), DocumentoInstrumento.id.desc())
        .limit(LIMITE_LISTAGEM)
    ):
        if documento.item_plano_id is not None:
            resultado.setdefault(documento.item_plano_id, documento)
    return resultado


def item_exige_licenca(db: Session, instrumento_id: int, item_id: int) -> bool:
    """O item é ativo, do instrumento, e a família dele exige licença da ANSN."""
    return bool(
        db.scalar(
            select(EquipamentoCatalogo.exige_licenca)
            .join(ItemPlano, ItemPlano.catalogo_id == EquipamentoCatalogo.id)
            .where(ItemPlano.id == item_id, ItemPlano.instrumento_id == instrumento_id, ItemPlano.ativo.is_(True))
        )
    )


def codigos_familias_com_licenca(db: Session) -> set[str]:
    return set(db.scalars(select(EquipamentoCatalogo.codigo).where(EquipamentoCatalogo.exige_licenca.is_(True))))


def licencas_deferidas_por_instrumento(
    db: Session, instrumento_ids: list[int]
) -> dict[int, list[tuple[DocumentoInstrumento, str | None]]]:
    """Licenças de operação deferidas e ativas, a mais recente de cada (instrumento, equipamento).

    O texto é a descrição do item do plano (None quando a licença não está ligada a equipamento)."""
    if not instrumento_ids:
        return {}
    resultado: dict[int, list[tuple[DocumentoInstrumento, str | None]]] = {}
    vistos: set[tuple[int, int | None]] = set()
    linhas = db.execute(
        select(DocumentoInstrumento, ItemPlano.descricao)
        .outerjoin(ItemPlano, ItemPlano.id == DocumentoInstrumento.item_plano_id)
        .where(
            DocumentoInstrumento.instrumento_id.in_(instrumento_ids),
            DocumentoInstrumento.tipo == "cnen_licenca",
            DocumentoInstrumento.status == "Deferido",
            *_ATIVO,
        )
        .order_by(DocumentoInstrumento.data_documento.desc(), DocumentoInstrumento.id.desc())
    )
    for documento, descricao in linhas:
        chave = (documento.instrumento_id, documento.item_plano_id)
        if chave in vistos:
            continue
        vistos.add(chave)
        resultado.setdefault(documento.instrumento_id, []).append((documento, descricao))
    return resultado
