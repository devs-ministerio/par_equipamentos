"""Prova imutável reconstruída do schema local sobrevivente.

Schema versionado pela revisão aditiva 73b91e4c2a06; não habilita promoção.
"""

from datetime import datetime
from decimal import Decimal

from pydantic import JsonValue
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models import Base


class CandidatoLegadoRecaptura(Base):
    __tablename__ = "candidato_legado_recaptura"
    __table_args__ = (
        ForeignKeyConstraint(
            ["captura_id", "candidato_id"],
            ["candidato_legado_captura.id", "candidato_legado_captura.candidato_id"],
            name="fk_legado_recaptura_captura_candidato",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        UniqueConstraint("id", "captura_id", "candidato_id", name="uq_legado_recaptura_identidade"),
        UniqueConstraint("candidato_id", "fonte_captura_id", name="uq_legado_recaptura_rodada"),
        CheckConstraint("hash_conteudo ~ '^[a-f0-9]{64}$'", name="ck_legado_recaptura_hash"),
        CheckConstraint("length(btrim(situacao)) > 0", name="ck_legado_recaptura_situacao"),
        CheckConstraint("valor_global >= 0", name="ck_legado_recaptura_valor"),
        Index("idx_legado_recaptura_captura", "captura_id"),
        Index("idx_legado_recaptura_fonte", "fonte_captura_id"),
    )
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    candidato_id: Mapped[int] = mapped_column(
        ForeignKey("candidato_legado.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        nullable=False,
    )
    captura_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    fonte_captura_id: Mapped[int] = mapped_column(
        ForeignKey("fonte_captura.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        nullable=False,
    )
    hash_conteudo: Mapped[str] = mapped_column(String(64), nullable=False)
    situacao: Mapped[str] = mapped_column(String, nullable=False)
    valor_global: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    payload_oficial: Mapped[dict[str, JsonValue]] = mapped_column(JSONB, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
