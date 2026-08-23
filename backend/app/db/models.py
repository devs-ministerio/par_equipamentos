"""Modelos SQLAlchemy -- espelho de docs/design/schema_sieo.sql e da
Documentacao Tecnica (secao Banco de Dados). Fonte de verdade do schema
passa a ser este arquivo + as migrations do Alembic, nao mais o .sql cru.
"""
from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
)
from sqlalchemy import Enum as PgEnum
from sqlalchemy import (
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ----------------------------------------------------------------------------
# Enums (Python) -- mapeados para os tipos ENUM do Postgres pelo mesmo nome
# ----------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    admin = "admin"
    colaborador = "colaborador"
    leitor = "leitor"


class UserStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    suspended = "suspended"


class ConfigDecisionKey(str, enum.Enum):
    chave_macrorregiao = "chave_macrorregiao"
    denominador_oferta = "denominador_oferta"
    metrica_cobertura = "metrica_cobertura"


class ReferenceFileType(str, enum.Enum):
    accelerator = "accelerator"
    population = "population"


class IncaEstimateLevel(str, enum.Enum):
    uf = "uf"
    capital = "capital"


class ExecutionMode(str, enum.Enum):
    manual = "manual"
    automatic = "automatic"


class ExecutionStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class DeficitStatus(str, enum.Enum):
    deficient = "deficient"
    not_deficient = "not_deficient"
    not_available = "not_available"


class AlertType(str, enum.Enum):
    municipality_exception = "municipality_exception"
    macro_exception = "macro_exception"
    macro_code_divergence = "macro_code_divergence"


# ----------------------------------------------------------------------------
# 2. Identidade e acesso
# ----------------------------------------------------------------------------

class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    cpf_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        PgEnum(UserRole, name="user_role", native_enum=True), nullable=False,
        server_default=UserRole.colaborador.value,
    )
    status: Mapped[UserStatus] = mapped_column(
        PgEnum(UserStatus, name="user_status", native_enum=True), nullable=False,
        server_default=UserStatus.active.value,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    entity_name: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[int | None] = mapped_column(BigInteger)
    action: Mapped[str] = mapped_column(String, nullable=False)
    details: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ----------------------------------------------------------------------------
# 3. Decisoes de negocio
# ----------------------------------------------------------------------------

class ConfigDecision(Base):
    __tablename__ = "config_decision"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    key: Mapped[ConfigDecisionKey] = mapped_column(
        PgEnum(ConfigDecisionKey, name="config_decision_key", native_enum=True),
        nullable=False, unique=True,
    )
    value: Mapped[str] = mapped_column(String, nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ConfigDecisionHistory(Base):
    __tablename__ = "config_decision_history"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    config_decision_id: Mapped[int] = mapped_column(ForeignKey("config_decision.id", ondelete="CASCADE"), nullable=False)
    value: Mapped[str] = mapped_column(String, nullable=False)
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ----------------------------------------------------------------------------
# 4. Dados de referencia internos
# ----------------------------------------------------------------------------

class ReferenceFile(Base):
    __tablename__ = "reference_file"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    type: Mapped[ReferenceFileType] = mapped_column(
        PgEnum(ReferenceFileType, name="reference_file_type", native_enum=True), nullable=False,
    )
    reference_period: Mapped[date | None] = mapped_column(Date)
    original_file: Mapped[str] = mapped_column(String, nullable=False)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class AcceleratorRow(Base):
    __tablename__ = "accelerator_row"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    reference_file_id: Mapped[int] = mapped_column(ForeignKey("reference_file.id", ondelete="CASCADE"), nullable=False)
    cnes_code: Mapped[str] = mapped_column(String, nullable=False)
    facility_name: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    ibge_code: Mapped[str] = mapped_column(String, nullable=False)
    operational_qty: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class MunicipalityPopulationRow(Base):
    __tablename__ = "municipality_population_row"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    reference_file_id: Mapped[int] = mapped_column(ForeignKey("reference_file.id", ondelete="CASCADE"), nullable=False)
    ibge_code: Mapped[str] = mapped_column(String, nullable=False)
    resident_population: Mapped[int] = mapped_column(Integer, nullable=False)
    ans_population: Mapped[int] = mapped_column(Integer, nullable=False)
    sus_dependent_population: Mapped[int] = mapped_column(Integer, nullable=False)


class IncaEstimate(Base):
    __tablename__ = "inca_estimate"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    level: Mapped[IncaEstimateLevel] = mapped_column(
        PgEnum(IncaEstimateLevel, name="inca_estimate_level", native_enum=True), nullable=False,
    )
    uf: Mapped[str] = mapped_column(String(2), nullable=False)
    capital_ibge_code: Mapped[str | None] = mapped_column(String)
    estimated_cases: Mapped[int] = mapped_column(Integer, nullable=False)
    triennium: Mapped[str] = mapped_column(String, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


# ----------------------------------------------------------------------------
# 5. Execucao e competencia
# ----------------------------------------------------------------------------

class Competency(Base):
    """Bug real encontrado em 2026-08-21: `label` (AAAA-MM) sozinho era
    UNIQUE, sem distinguir familia de equipamento -- ao rodar o pipeline de
    RESSONANCIA numa competencia que o TOMOGRAFO ja tinha usado, a rotina de
    "so a ultima execucao da competencia fica publicada" (ver
    scripts/run_pipeline_tomografo.py) apagou a execucao de TOMOGRAFO
    daquele mes inteira (MacroCoverage/MunicipalityCoverage/EquipmentOfferRow),
    porque as duas familias compartilhavam a mesma Competency. Corrigido:
    unique agora e (label, equipment_family)."""

    __tablename__ = "competency"
    __table_args__ = (UniqueConstraint("label", "equipment_family"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    equipment_family: Mapped[str] = mapped_column(String, nullable=False, server_default="TOMOGRAFO")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_execution_id: Mapped[int | None] = mapped_column(
        ForeignKey("execution.id", ondelete="RESTRICT", use_alter=True, name="fk_competency_published_execution")
    )


class Execution(Base):
    __tablename__ = "execution"
    __table_args__ = (UniqueConstraint("competency_id", "version"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    competency_id: Mapped[int] = mapped_column(ForeignKey("competency.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[ExecutionMode] = mapped_column(
        PgEnum(ExecutionMode, name="execution_mode", native_enum=True), nullable=False,
    )
    status: Mapped[ExecutionStatus] = mapped_column(
        PgEnum(ExecutionStatus, name="execution_status", native_enum=True), nullable=False,
        server_default=ExecutionStatus.draft.value,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    executed_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    error: Mapped[str | None] = mapped_column(String)
    config_chave_macrorregiao: Mapped[str] = mapped_column(String, nullable=False)
    config_denominador_oferta: Mapped[str] = mapped_column(String, nullable=False)
    accelerator_file_id: Mapped[int | None] = mapped_column(ForeignKey("reference_file.id"))
    population_file_id: Mapped[int | None] = mapped_column(ForeignKey("reference_file.id"))
    active_sources: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))


# ----------------------------------------------------------------------------
# 6. Resultado calculado
# ----------------------------------------------------------------------------

class MacroCoverage(Base):
    __tablename__ = "macro_coverage"
    # toda leitura parte de (execucao + familia) -- sem isso o Postgres varre
    # a tabela inteira a cada request do Dashboard/Mapa.
    __table_args__ = (
        Index("ix_macro_coverage_execution_family", "execution_id", "equipment_family"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    execution_id: Mapped[int] = mapped_column(ForeignKey("execution.id", ondelete="CASCADE"), nullable=False)
    macro_code: Mapped[str] = mapped_column(String, nullable=False)
    macro_name: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    equipment_family: Mapped[str] = mapped_column(String, nullable=False)
    # populacao SUS-dependente (IBGE ao vivo - ANS do arquivo de referencia,
    # nunca negativa) -- e o denominador de DEMANDA usado no calculo
    # (estimated_need/required_qty), consistente com D-02 (oferta ja e so
    # SUS). population_residente/population_ans ficam so pra transparencia
    # no front (breakdown "quantos dependem do SUS de quantos no total").
    population: Mapped[int | None] = mapped_column(Integer)
    population_residente: Mapped[int | None] = mapped_column(Integer)
    population_ans: Mapped[int | None] = mapped_column(Integer)
    estimated_need: Mapped[float | None] = mapped_column(Numeric)
    required_qty: Mapped[int | None] = mapped_column(Integer)
    available_qty: Mapped[int | None] = mapped_column(Integer)
    existing_qty: Mapped[int | None] = mapped_column(Integer)
    facility_count: Mapped[int | None] = mapped_column(Integer)
    balance: Mapped[int | None] = mapped_column(Integer)
    deficit_status: Mapped[DeficitStatus] = mapped_column(
        PgEnum(DeficitStatus, name="deficit_status", native_enum=True), nullable=False,
    )


class MunicipalityCoverage(Base):
    """Mesmo calculo de MacroCoverage, granularizado por municipio (chave
    IBGE) em vez de macrorregiao -- alimenta a tabela "Cobertura Assistencial"
    do Dashboard quando o filtro escolhido afunila ate Municipio/CNES
    (decisao 2026-08-21). Guarda tambem macro_code/health_region_code pra
    filtrar e pra "Regiao de Saude" poder ser agregada a partir daqui em
    tempo de leitura (GROUP BY health_region_code), sem precisar de uma
    terceira tabela pre-computada."""

    __tablename__ = "municipality_coverage"
    __table_args__ = (
        Index("ix_municipality_coverage_execution_family", "execution_id", "equipment_family"),
        Index("ix_municipality_coverage_execution_health_region", "execution_id", "health_region_code"),
        Index("ix_municipality_coverage_execution_macro", "execution_id", "macro_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    execution_id: Mapped[int] = mapped_column(ForeignKey("execution.id", ondelete="CASCADE"), nullable=False)
    ibge_code: Mapped[str] = mapped_column(String, nullable=False)
    municipality_name: Mapped[str] = mapped_column(String, nullable=False)
    health_region_code: Mapped[str | None] = mapped_column(String)
    health_region_name: Mapped[str | None] = mapped_column(String)
    macro_code: Mapped[str | None] = mapped_column(String)
    macro_name: Mapped[str | None] = mapped_column(String)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    equipment_family: Mapped[str] = mapped_column(String, nullable=False)
    population: Mapped[int | None] = mapped_column(Integer)  # SUS-dependente -- ver MacroCoverage
    population_residente: Mapped[int | None] = mapped_column(Integer)
    population_ans: Mapped[int | None] = mapped_column(Integer)
    estimated_need: Mapped[float | None] = mapped_column(Numeric)
    required_qty: Mapped[int | None] = mapped_column(Integer)
    available_qty: Mapped[int | None] = mapped_column(Integer)
    existing_qty: Mapped[int | None] = mapped_column(Integer)
    facility_count: Mapped[int | None] = mapped_column(Integer)
    balance: Mapped[int | None] = mapped_column(Integer)
    deficit_status: Mapped[DeficitStatus] = mapped_column(
        PgEnum(DeficitStatus, name="deficit_status", native_enum=True), nullable=False,
    )
    # Distancia (Haversine, km) ate o equipamento SUS geocodificado mais
    # proximo dessa familia, em qualquer macro/UF do pais -- metade
    # geografica do criterio do Tomografo (Caderno 1: "100 mil hab. OU raio
    # de 75 km") que so tinha a parte populacional calculada ate 2026-08-22
    # (ver app/pipeline/geo.py). SO INFORMATIVO por enquanto -- NAO entra em
    # deficit_status, que continua 100% populacional (decisao normativa de
    # aplicar o "OR raio" na classificacao oficial ainda pendente de
    # confirmacao). Nulo pra familias cujo pipeline ainda nao calcula isso
    # (so TOMOGRAFO por enquanto) ou quando nem municipio nem nenhum
    # equipamento da familia tem coordenada.
    distance_km_nearest_equipment: Mapped[float | None] = mapped_column(Numeric)


class EquipmentOfferRow(Base):
    __tablename__ = "equipment_offer_row"
    # Todas as consultas de leitura filtram por (execution_id, equipment_family)
    # primeiro e depois por um recorte geografico. Os indices compostos abaixo
    # seguem essa ordem para o Postgres conseguir usar o mesmo indice nos dois
    # niveis do filtro, em vez de varrer a tabela (Seq Scan).
    __table_args__ = (
        Index("ix_eor_execution_family", "execution_id", "equipment_family"),
        Index("ix_eor_execution_family_state", "execution_id", "equipment_family", "state"),
        Index("ix_eor_execution_macro", "execution_id", "macro_code"),
        Index("ix_eor_execution_health_region", "execution_id", "health_region_code"),
        Index("ix_eor_execution_municipality", "execution_id", "municipality_name"),
        Index("ix_eor_execution_cnes", "execution_id", "cnes_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    execution_id: Mapped[int] = mapped_column(ForeignKey("execution.id", ondelete="CASCADE"), nullable=False)
    cnes_code: Mapped[str] = mapped_column(String, nullable=False)
    facility_name: Mapped[str | None] = mapped_column(String)
    ibge_code: Mapped[str] = mapped_column(String, nullable=False)
    municipality_name: Mapped[str | None] = mapped_column(String)
    macro_code: Mapped[str | None] = mapped_column(String)
    macro_name: Mapped[str | None] = mapped_column(String)
    health_region_code: Mapped[str | None] = mapped_column(String)
    health_region_name: Mapped[str | None] = mapped_column(String)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    equipment_family: Mapped[str] = mapped_column(String, nullable=False)
    equipment_subtype: Mapped[str | None] = mapped_column(String)
    existing_qty: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    in_use_qty: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    sus_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # `location` do ElastiCNES ("lat,long" em texto) -- nem todo estabelecimento
    # tem coordenada cadastrada (ver COORDENADAS GEOGRAFICAS 1), por isso
    # nullable; usado pra pino exato no Mapa em vez do centroide do municipio.
    latitude: Mapped[float | None] = mapped_column(Numeric)
    longitude: Mapped[float | None] = mapped_column(Numeric)
    # `NATUREZA JURIDICA CATEGORIA` do ElastiCNES (ex.: "PRIVADO", "PUBLICO") --
    # texto cru da fonte, sem enum: e vocabulario do CNES, nao nosso, pode
    # ganhar categoria nova sem passar por migration.
    legal_nature: Mapped[str | None] = mapped_column(String)


# ----------------------------------------------------------------------------
# 7. Qualidade de dado
# ----------------------------------------------------------------------------

class ExecutionAlert(Base):
    __tablename__ = "execution_alert"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    execution_id: Mapped[int] = mapped_column(ForeignKey("execution.id", ondelete="CASCADE"), nullable=False)
    alert_type: Mapped[AlertType] = mapped_column(
        PgEnum(AlertType, name="alert_type", native_enum=True), nullable=False,
    )
    details: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
