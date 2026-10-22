"""Radar legado separado da carteira e do monitoramento pós-repasse."""

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models import Base
from app.db.models_recaptura_legado import CandidatoLegadoRecaptura as CandidatoLegadoRecaptura


class CandidatoLegadoRegistro(Base):
    __tablename__ = "candidato_legado"
    __table_args__ = (
        UniqueConstraint("numero", name="uq_candidato_legado_numero"),
        UniqueConstraint("id_proposta", name="uq_candidato_legado_proposta"),
        CheckConstraint("numero ~ '^[0-9A-Z]+$' AND id_proposta ~ '^[0-9]+$'", name="ck_candidato_legado_identidade"),
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
        UniqueConstraint("id", "candidato_id", name="uq_legado_captura_candidato"),
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
            "criterio_escopo IS NULL OR criterio_escopo IN ('prioritarios_ms_v1','prioritarios_ms_celebrados_v2')",
            name="ck_legado_criterio_escopo",
        ),
        CheckConstraint(
            "(criterio_escopo IS NULL AND orgao_superior IS NULL) OR "
            "(criterio_escopo IS NOT NULL AND orgao_superior IS NOT NULL AND orgao_superior = '36000')",
            name="ck_legado_orgao_escopo",
        ),
        CheckConstraint(
            "criterio_escopo IS DISTINCT FROM 'prioritarios_ms_celebrados_v2' OR "
            "(data_assinatura_siconv IS NOT NULL AND data_publicacao_siconv IS NOT NULL)",
            name="ck_legado_celebracao_siconv",
        ),
        CheckConstraint(
            "(elegivel AND motivo_inelegibilidade IS NULL) OR "
            "(NOT elegivel AND motivo_inelegibilidade IS NOT NULL AND "
            "motivo_inelegibilidade = 'fora_recorte_oficial' AND fonte_captura_id IS NOT NULL)",
            name="ck_legado_inelegibilidade_rodada",
        ),
        CheckConstraint(
            "hash_conteudo ~ '^[a-f0-9]{64}$' AND referencia_snapshot ~ '^[a-f0-9]{64}$'",
            name="ck_candidato_legado_captura_hash",
        ),
        Index("idx_candidato_legado_captura_candidato", "candidato_id", "capturado_em"),
        Index("idx_legado_captura_fonte", "fonte_captura_id"),
    )
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    candidato_id: Mapped[int] = mapped_column(
        ForeignKey("candidato_legado.id", ondelete="CASCADE", onupdate="RESTRICT"), nullable=False
    )
    confirmacao_portal: Mapped[str] = mapped_column(String, nullable=False)
    data_publicacao: Mapped[date | None] = mapped_column(Date)
    criterio_escopo: Mapped[str | None] = mapped_column(String(32))
    orgao_superior: Mapped[str | None] = mapped_column(String(5))
    data_assinatura_siconv: Mapped[date | None] = mapped_column(Date)
    data_publicacao_siconv: Mapped[date | None] = mapped_column(Date)
    elegivel: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    motivo_inelegibilidade: Mapped[str | None] = mapped_column(String(32))
    fonte_captura_id: Mapped[int | None] = mapped_column(
        ForeignKey("fonte_captura.id", name="fk_legado_captura_fonte", ondelete="RESTRICT", onupdate="RESTRICT")
    )
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


class CandidatoLegadoComponente(Base):
    """Evidência do programa vinculada à captura; não é equipamento entregue."""

    __tablename__ = "candidato_legado_componente"
    __table_args__ = (
        UniqueConstraint("captura_id", "id_programa", "nome_programa", name="uq_legado_componente_programa"),
        CheckConstraint("id_programa ~ '^[0-9]+$'", name="ck_legado_componente_programa"),
        Index("idx_legado_componente_captura", "captura_id"),
    )
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    captura_id: Mapped[int] = mapped_column(
        ForeignKey("candidato_legado_captura.id", ondelete="RESTRICT", onupdate="RESTRICT"), nullable=False
    )
    id_programa: Mapped[str] = mapped_column(String, nullable=False)
    nome_programa: Mapped[str] = mapped_column(String, nullable=False)
    componente: Mapped[str] = mapped_column(String, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CandidatoLegadoDecisao(Base):
    """Decisão humana imutável; confirmação da fonte não é aprovação."""

    __tablename__ = "candidato_legado_decisao"
    __table_args__ = (
        ForeignKeyConstraint(
            ["captura_id", "candidato_id"],
            ["candidato_legado_captura.id", "candidato_legado_captura.candidato_id"],
            name="fk_legado_decisao_captura_candidato",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        UniqueConstraint("candidato_id", "chave", name="uq_candidato_legado_decisao_chave"),
        UniqueConstraint("convenio_id", name="uq_legado_decisao_convenio"),
        UniqueConstraint("recaptura_id", name="uq_legado_decisao_recaptura"),
        ForeignKeyConstraint(
            ["recaptura_id", "captura_id", "candidato_id"],
            [
                "candidato_legado_recaptura.id",
                "candidato_legado_recaptura.captura_id",
                "candidato_legado_recaptura.candidato_id",
            ],
            name="fk_legado_decisao_recaptura_identidade",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        CheckConstraint(
            "(situacao = 'aprovado' AND recaptura_id IS NOT NULL AND convenio_id IS NOT NULL) OR "
            "(situacao <> 'aprovado' AND recaptura_id IS NULL AND convenio_id IS NULL)",
            name="ck_legado_decisao_aprovacao_vinculos",
        ),
        CheckConstraint("situacao_anterior IN ('novo','em_analise')", name="ck_legado_decisao_anterior"),
        CheckConstraint("situacao IN ('em_analise','rejeitado','aprovado')", name="ck_legado_decisao_situacao"),
        CheckConstraint(
            "(situacao = 'em_analise' AND situacao_anterior = 'novo') OR situacao IN ('rejeitado','aprovado')",
            name="ck_legado_decisao_transicao",
        ),
        CheckConstraint("length(btrim(justificativa)) BETWEEN 3 AND 1000", name="ck_legado_decisao_justificativa"),
        Index("idx_legado_decisao_candidato_id", "candidato_id", "id"),
        Index("idx_legado_decisao_captura", "captura_id"),
        Index("idx_legado_decisao_usuario", "usuario_id"),
    )
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    candidato_id: Mapped[int] = mapped_column(
        ForeignKey("candidato_legado.id", ondelete="RESTRICT", onupdate="RESTRICT"), nullable=False
    )
    captura_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    recaptura_id: Mapped[int | None] = mapped_column(BigInteger)
    convenio_id: Mapped[int | None] = mapped_column(
        ForeignKey("convenio.id", name="fk_legado_decisao_convenio", ondelete="RESTRICT", onupdate="RESTRICT")
    )
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="RESTRICT", onupdate="RESTRICT"), nullable=False
    )
    chave: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    situacao_anterior: Mapped[str] = mapped_column(String, nullable=False)
    situacao: Mapped[str] = mapped_column(String, nullable=False)
    justificativa: Mapped[str] = mapped_column(String(1000), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
