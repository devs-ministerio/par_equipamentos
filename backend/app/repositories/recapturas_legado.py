"""Persistência da prova; autorização, frescor e commit pertencem ao Service."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import FonteCaptura
from app.db.models_recaptura_legado import CandidatoLegadoRecaptura


def obter_tentativa(
    db: Session,
    candidato_id: int,
    iniciado_em: datetime,
) -> tuple[CandidatoLegadoRecaptura, FonteCaptura] | None:
    prova = CandidatoLegadoRecaptura
    linha = db.execute(
        select(prova, FonteCaptura)
        .join(FonteCaptura, FonteCaptura.id == prova.fonte_captura_id)
        .where(
            prova.candidato_id == candidato_id,
            FonteCaptura.fonte == "siconv_recaptura",
            FonteCaptura.iniciado_em == iniciado_em,
        )
    ).one_or_none()
    return (linha[0], linha[1]) if linha is not None else None


def adicionar(db: Session, registro: CandidatoLegadoRecaptura) -> None:
    db.add(registro)
    db.flush()


def obter_ultima(db: Session, candidato_id: int) -> CandidatoLegadoRecaptura | None:
    prova = CandidatoLegadoRecaptura
    return db.scalar(
        select(prova)
        .where(prova.candidato_id == candidato_id)
        .order_by(prova.id.desc())
        .limit(1)
        .execution_options(populate_existing=True)
    )


def obter_fonte(db: Session, fonte_id: int) -> FonteCaptura | None:
    return db.scalar(select(FonteCaptura).where(FonteCaptura.id == fonte_id).execution_options(populate_existing=True))


def obter_por_rodada(db: Session, candidato_id: int, fonte_captura_id: int) -> CandidatoLegadoRecaptura | None:
    prova = CandidatoLegadoRecaptura
    return db.scalar(
        select(prova).where(prova.candidato_id == candidato_id, prova.fonte_captura_id == fonte_captura_id)
    )


def obter_por_identidade(
    db: Session,
    recaptura_id: int,
    captura_id: int,
    candidato_id: int,
) -> CandidatoLegadoRecaptura | None:
    prova = CandidatoLegadoRecaptura
    return db.scalar(
        select(prova).where(
            prova.id == recaptura_id, prova.captura_id == captura_id, prova.candidato_id == candidato_id
        )
    )
