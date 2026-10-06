"""Radar legado separado da carteira e do monitoramento pós-repasse."""

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models import Base


class CandidatoLegadoRegistro(Base):
    __tablename__ = "candidato_legado"
    __table_args__ = (
        UniqueConstraint("numero", name="uq_candidato_legado_numero"),
        UniqueConstraint("id_proposta", name="uq_candidato_legado_proposta"),
        CheckConstraint("numero ~ '^[0-9]+$' AND id_proposta ~ '^[0-9]+$'", name="ck_candidato_legado_identidade"),
        Index("idx_candidato_legado_verificado", "verificado_em", "id"),
        Index("idx_candidato_legado_captura", "ultima_captura_id"),
    )
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    numero: Mapped[str] = mapped_column(String, nullable=False)
    id_proposta: Mapped[str] = mapped_column(String, nullable=False)
    ultima_captura_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "candidato_legado_captura.id",
            name="fk_candidato_legado_ultima_captura",
            ondelete="SET NULL",
            onupdate="RESTRICT",
            use_alter=True,
        )
    )
    descoberto_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    verificado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CandidatoLegadoCaptura(Base):
    __tablename__ = "candidato_legado_captura"
    __table_args__ = (
        CheckConstraint(
            "confirmacao_portal IN ('nao_consultado','nao_encontrado','sem_publicacao','confirmado')",
            name="ck_candidato_legado_captura_confirmacao",
        ),
        CheckConstraint(
            "(confirmacao_portal = 'confirmado') = (data_publicacao IS NOT NULL)",
            name="ck_candidato_legado_captura_publicacao",
        ),
        CheckConstraint("origem IN ('snapshot_local','siconv_oficial')", name="ck_candidato_legado_captura_origem"),
        CheckConstraint(
            "hash_conteudo ~ '^[a-f0-9]{64}$' AND referencia_snapshot ~ '^[a-f0-9]{64}$'",
            name="ck_candidato_legado_captura_hash",
        ),
        Index("idx_candidato_legado_captura_candidato", "candidato_id", "capturado_em"),
    )
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    candidato_id: Mapped[int] = mapped_column(
        ForeignKey("candidato_legado.id", ondelete="CASCADE", onupdate="RESTRICT"), nullable=False
    )
    confirmacao_portal: Mapped[str] = mapped_column(String, nullable=False)
    data_publicacao: Mapped[date | None] = mapped_column(Date)
    origem: Mapped[str] = mapped_column(String, nullable=False)
    referencia_snapshot: Mapped[str] = mapped_column(String(64), nullable=False)
    hash_conteudo: Mapped[str] = mapped_column(String(64), nullable=False)
    capturado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CandidatoLegadoEvidencia(Base):
    __tablename__ = "candidato_legado_evidencia"
    __table_args__ = (
        UniqueConstraint("captura_id", "id_item", "equipamento_catalogo_id", name="uq_candidato_legado_evidencia_item"),
        CheckConstraint(
            "relacao IN ('aquisicao','modernizacao','existente','mencao')", name="ck_candidato_legado_evidencia_relacao"
        ),
        Index("idx_candidato_legado_evidencia_catalogo", "equipamento_catalogo_id"),
    )
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    captura_id: Mapped[int] = mapped_column(
        ForeignKey("candidato_legado_captura.id", ondelete="CASCADE", onupdate="RESTRICT"), nullable=False
    )
    equipamento_catalogo_id: Mapped[int] = mapped_column(
        ForeignKey("equipamento_catalogo.id", ondelete="RESTRICT", onupdate="RESTRICT"), nullable=False
    )
    id_item: Mapped[str] = mapped_column(String, nullable=False)
    descricao: Mapped[str] = mapped_column(String, nullable=False)
    relacao: Mapped[str] = mapped_column(String, nullable=False)
