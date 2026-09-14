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
    text,
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


class MarcoGrupo(str, enum.Enum):
    """3 blocos que a propria equipe de monitoramento ja usa (planilha
    "Monitoramento Base de Dados - Convenio FAF TED", aba Instrucional,
    2026-09-03): a fase macro do instrumento (o que "Situacao"/"Fase"/
    "Execucao Fisica %" da planilha cobrem), o cronograma fisico do
    equipamento em si (fabricacao/porto/entrega/instalacao/obra -- nao
    existe em NENHUM sistema federal, so acompanhamento manual) e os
    processos regulatorios (CNEN -- matricula, licenca de operacao,
    descomissionamento/casamata -- so relevante pra equipamento que emite
    radiacao: Acelerador Linear, Braquiterapia, PET-CT, Gama Camara)."""
    fase_geral = "fase_geral"
    cronograma_fisico = "cronograma_fisico"
    regulatorio = "regulatorio"


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
    """Append-only (SCD Type 2) -- nunca faz UPDATE de `value`. Trocar a
    decisao de uma chave e sempre um INSERT de linha nova + fechar
    `valid_to` da linha vigente anterior, numa unica transacao (ver
    `app.config_decisions.registrar_decisao`). Substitui o par
    ConfigDecision (mutavel) + ConfigDecisionHistory (append-only)
    que existia antes -- evitava duas escritas em tabelas separadas
    poderem ficar fora de sincronia (mesma classe de bug que o
    audit_log gravado fora da transacao principal). "Vigente" = linha
    com valid_to IS NULL; o indice unico parcial abaixo garante no
    banco que so existe uma vigente por chave."""

    __tablename__ = "config_decision"
    __table_args__ = (
        Index(
            "ux_config_decision_key_vigente", "key", unique=True,
            postgresql_where=text("valid_to IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    key: Mapped[ConfigDecisionKey] = mapped_column(
        PgEnum(ConfigDecisionKey, name="config_decision_key", native_enum=True), nullable=False,
    )
    value: Mapped[str] = mapped_column(String, nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # NULL = vigente. Preenchido com now() no exato INSERT que a substitui
    # (ver registrar_decisao) -- nunca um UPDATE solto depois.
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


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
    # Distancia (Haversine, km) e tempo estimado (horas, formula -- NAO rota
    # real, ver app/pipeline/radiofarmaco.py) ate o produtor de radiofarmaco
    # PET (FDG-18F) mais proximo, em qualquer UF do pais. Criterio normativo
    # (Portaria de Consolidacao GM/MS n. 1/2017, art. 102-106): a meia-vida
    # do FDG e 110 min, o PET_CT deve estar a uma distancia que permita
    # acesso ao radiofarmaco em ate 2h. SO INFORMATIVO -- NAO entra em
    # deficit_status (mesmo tratamento do distance_km_nearest_equipment
    # acima). Nulo pra familias diferentes de PET_CT (unica que roda esse
    # calculo hoje) ou quando o municipio nao tem coordenada de referencia.
    distance_km_nearest_radiopharma: Mapped[float | None] = mapped_column(Numeric)
    hours_road_nearest_radiopharma: Mapped[float | None] = mapped_column(Numeric)
    hours_air_nearest_radiopharma: Mapped[float | None] = mapped_column(Numeric)


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


# ----------------------------------------------------------------------------
# 8. Monitoramento de equipamento (pos-repasse) -- esforco separado da
# analise de merito de hipo/hipersuficiencia (decisao 2026-09-03). Cobre o
# que nenhum sistema federal (TransfereGov, Portal da Transparencia, SICONV)
# rastreia: o caminho fisico do equipamento apos o dinheiro sair -- entrega,
# instalacao, licenciamento, inauguracao. Ver docs/monitoramento-equipamentos/.
# ----------------------------------------------------------------------------

class MarcoCatalogo(Base):
    """Catalogo FIXO de marcos -- nao e texto livre pro dashboard conseguir
    agregar. Populado por scripts/seed_monitoramento.py a partir do
    vocabulario ja pactuado pela equipe (planilha FAF TED, aba Instrucional)."""
    __tablename__ = "marco_catalogo"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    grupo: Mapped[MarcoGrupo] = mapped_column(PgEnum(MarcoGrupo, name="marco_grupo", native_enum=True), nullable=False)
    # So preenchido em grupo=fase_geral -- define a ordem de progressao (pra
    # derivar "fase atual" = marco de maior ordem com evento registrado) e o
    # % de execucao fisica de referencia (0 a 1) que a planilha ja usa.
    ordem: Mapped[int | None] = mapped_column(Integer)
    execucao_fisica_pct_referencia: Mapped[float | None] = mapped_column(Numeric)
    rotulo: Mapped[str] = mapped_column(String, nullable=False)
    descricao_referencia: Mapped[str | None] = mapped_column(String)


class InstrumentoEquipamento(Base):
    """1 linha por instrumento monitorado -- o "no" que amarra o numero do
    convenio (SICONV/Portal da Transparencia) com o acompanhamento manual.
    Cruzamento com as fontes automaticas (convenios.json/siconv.json/
    transferegov.json) e por `nr_convenio`, feito na aplicacao -- essa
    tabela nao duplica dado que ja vem das APIs (valor, situacao contratual),
    so guarda o que e especifico do monitoramento interno."""
    __tablename__ = "instrumento_equipamento"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    nr_convenio: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    cnpj_convenente: Mapped[str] = mapped_column(String, nullable=False)
    nome_convenente: Mapped[str] = mapped_column(String, nullable=False)
    municipio: Mapped[str | None] = mapped_column(String)
    uf: Mapped[str | None] = mapped_column(String(2))
    cnes: Mapped[str | None] = mapped_column(String)
    # "ID MODELO NO SIGEM/TRANSFEREGOV" da planilha -- descricao do
    # equipamento PLANEJADO (o que o SICONV/plano de aplicacao diz que vai
    # ser comprado, ex. "Acelerador Linear so de Fotons (monoenergetico 6
    # MV)"). NUNCA editavel pela pagina de monitoramento (decisao do
    # usuario 2026-09-09: "Não vamos alterar o equipamento que veio do
    # SISCONV") -- so os 4 campos abaixo (equipamento_* fisico) sao.
    equipamento_descricao: Mapped[str | None] = mapped_column(String)
    # Dados do equipamento FISICO de verdade, informados pelo
    # estabelecimento de saude DEPOIS da entrega -- achado 2026-09-09,
    # etapa preparatoria pra futuramente monitorar o equipamento entregue
    # com dado real, nao so o que SICONV/TransfereGov planejaram. Nulos ate
    # o estabelecimento informar (nao ha fonte automatica pra isso, mesma
    # logica documentada no CLAUDE.md pra CNES/ElastiCNES nao ter
    # granularidade por equipamento -- aqui e coleta manual de proposito).
    equipamento_marca: Mapped[str | None] = mapped_column(String)
    equipamento_modelo: Mapped[str | None] = mapped_column(String)
    equipamento_numero_serie: Mapped[str | None] = mapped_column(String)
    equipamento_vida_util_anos: Mapped[int | None] = mapped_column(Integer)
    # Programa (nm_programa da API TransfereGov /parcerias/programa, quando
    # existir correspondencia) e Componente (coluna "COMPONENTES DE
    # FINANCIAMENTO - INVESTUSUS" da planilha, ex. "RADIOTERAPIA", "REDE DE
    # ATENCAO A PESSOA COM DOENCAS CRONICAS - HOSPITAL HABILITADO NA ALTA
    # COMPLEXIDADE EM ONCOLOGIA") -- criterio pra decidir o que entra no
    # escopo de monitoramento. Achado 2026-09-03: nem todo `id_programa` que
    # tem "EQUIPAMENTO" no objeto e Fundo a Fundo/TED (a familia que este
    # monitoramento cobre) -- 46 de 76 propostas testadas eram Pronon/Pronas/
    # Lei de Incentivo (doacao com incentivo fiscal, fluxo sem empenho/
    # desembolso do Tesouro, fora de escopo aqui). `tp_instrumento_programa`
    # guarda o texto da API (ex. "Transferencias Fundo a Fundo da Saude")
    # pra filtrar isso de forma explicita, nao reconstruir a decisao de
    # memoria depois.
    programa: Mapped[str | None] = mapped_column(String)
    tp_instrumento_programa: Mapped[str | None] = mapped_column(String)
    componente: Mapped[str | None] = mapped_column(String)
    ano_instrumento: Mapped[int | None] = mapped_column(Integer)
    # Coluna "TIPO DE CONTRATAÇÃO" da planilha -- achado 2026-09-09 (pedido
    # do usuario: incluir os 28 registros FAF/TED que ficaram de fora do
    # import inicial por nao terem numero de convenio TransfereGov). Nunca
    # editavel a mao (so vem da planilha/import) -- "Convênio" pros 105 do
    # universo de 403, "FAF"/"TED" pros que entram so por NUP SEI (ver
    # comentario em nr_convenio nao existe aqui, mas o import script
    # documenta a resolucao de identificador). None quando a propria
    # planilha nao sabia.
    tipo_contratacao: Mapped[str | None] = mapped_column(String)
    # Deliberadamente SEM valor_global/valor_repasse/valor_contrapartida/situacao
    # aqui (decisao do usuario, 2026-09-03): esses campos JA existem em API
    # (Portal da Transparencia /convenios/numero) -- guardar uma copia
    # congelada no banco arriscaria ficar desatualizado (ex.: convenio muda
    # de situacao, valor sofre aditivo). app/routers/monitoramento.py busca
    # esses 2 campos AO VIVO via `app.pipeline.portal_transparencia` toda vez
    # que a timeline e exibida -- esta tabela so guarda o que NENHUMA API
    # publica tem (dado de gestao interna).
    tecnico_titular: Mapped[str | None] = mapped_column(String)
    tecnico_suplente: Mapped[str | None] = mapped_column(String)
    nivel_monitoramento: Mapped[str | None] = mapped_column(String)
    finalidade: Mapped[str | None] = mapped_column(String)
    modalidade_onco: Mapped[str | None] = mapped_column(String)
    # Responsavel tecnico da execucao NA INSTITUICAO/convenente (colunas 42-43
    # da planilha) -- achado 2026-09-09, DIFERENTE de tecnico_titular/suplente
    # acima (que sao da NOSSA equipe DECAN/FNS). Opcional de proposito, sem
    # exigir preenchimento (pedido do usuario: "pode incluir o campo pro
    # contato mas sem obrigacao de preenchimento").
    responsavel_execucao_nome: Mapped[str | None] = mapped_column(String)
    responsavel_execucao_contato: Mapped[str | None] = mapped_column(String)
    # Situacao da PRESTACAO DE CONTAS (TransfereGov, ex. "Prestação de
    # Contas Concluída") -- achado 2026-09-14: campo DIFERENTE do
    # `situacao` buscado ao vivo do Portal da Transparencia (comentario
    # acima), que e status financeiro/orcamentario do convenio ("Normal",
    # "Inadimplente"...), nao da prestacao de contas. A API nova do
    # TransfereGov nao tem endpoint de consulta por numero de convenio
    # legado (so CSV bulk, ver docs/transferegov-investsus.md) -- por isso,
    # ao contrario de `situacao`, este campo NAO da pra buscar ao vivo e
    # precisa ser dado manual (planilha/import ou PATCH), como
    # tecnico_titular etc.
    situacao_prestacao_contas: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EventoMarco(Base):
    """Log append-only -- MESMA filosofia do ConfigDecision (nunca UPDATE):
    corrigir um marco e lancar um evento novo, nunca editar um existente.
    "Estado atual" de um instrumento e sempre DERIVADO na aplicacao (o
    evento mais recente de cada marco; a fase geral atual = marco de
    grupo=fase_geral com maior `ordem` que tenha evento com
    data_ocorrencia preenchida) -- nao existe coluna de status mutavel
    em `instrumento_equipamento` de proposito, pra nao correr o risco de
    status e historico saírem de sincronia (mesma razao documentada no
    ConfigDecision)."""
    __tablename__ = "evento_marco"
    __table_args__ = (
        Index("ix_evento_marco_instrumento_marco", "instrumento_id", "marco_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    instrumento_id: Mapped[int] = mapped_column(ForeignKey("instrumento_equipamento.id", ondelete="CASCADE"), nullable=False)
    marco_id: Mapped[int] = mapped_column(ForeignKey("marco_catalogo.id"), nullable=False)
    data_ocorrencia: Mapped[date | None] = mapped_column(Date)
    data_prevista: Mapped[date | None] = mapped_column(Date)
    # So usado em marco de grupo=regulatorio -- vocabulario da propria CNEN/
    # planilha (NI, NA, Em analise, Em diligencia, Deferido, Indeferido), sem
    # enum de proposito: e terminologia externa, pode ganhar variante nova
    # sem exigir migration (mesmo raciocinio do `legal_nature` em
    # EquipmentOfferRow).
    status_regulatorio: Mapped[str | None] = mapped_column(String)
    # Numero de matricula/licenca/processo (ex. matricula CNEN "16981") --
    # achado 2026-09-09: esse numero estava sendo gravado dentro de
    # `status_regulatorio` no seed (gambiarra, ver seed_monitoramento.py e a
    # migration que corrige o dado ja gravado). `status_regulatorio` fica so
    # pro vocabulario de status; numero de documento tem coluna propria.
    numero_documento: Mapped[str | None] = mapped_column(String)
    # Validade da licenca/matricula (licenca de operacao CNEN normalmente
    # tem prazo e precisa renovacao) -- usada pro alerta de vencimento na
    # pagina de monitoramento, nao so registro passivo.
    data_validade: Mapped[date | None] = mapped_column(Date)
    observacao: Mapped[str | None] = mapped_column(String)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcaoMonitoramento(Base):
    """Tarefa/pendencia da equipe -- DIFERENTE de EventoMarco de proposito
    (achado 2026-09-09, pedido do usuario: "as ações ficaria bom separado
    dos eventos"). EventoMarco e historico fechado contra um catalogo FIXO
    de marcos (fase/cronograma/regulatorio), sempre um registro do que JA
    aconteceu. AcaoMonitoramento e texto livre, sem taxonomia fixa, com
    ESTADO (pendente/concluida) e data de vencimento -- e o que alimenta
    "dividas em acoes por data" na pagina de overview.

    `data_conclusao` e o UNICO campo desta tabela pensado pra ser
    preenchido depois de criado (marcar concluida) -- descricao/
    data_prevista/responsavel continuam imutaveis apos o registro, mesma
    disciplina do restante do monitoramento interno (corrigir e lancar
    ação nova, nao editar a existente)."""
    __tablename__ = "acao_monitoramento"
    __table_args__ = (
        Index("ix_acao_monitoramento_instrumento", "instrumento_id", "data_prevista"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    instrumento_id: Mapped[int] = mapped_column(ForeignKey("instrumento_equipamento.id", ondelete="CASCADE"), nullable=False)
    descricao: Mapped[str] = mapped_column(String, nullable=False)
    data_prevista: Mapped[date | None] = mapped_column(Date)
    # NULL = pendente. Preenchida quando a acao e marcada como concluida
    # (unico UPDATE que esta tabela permite de proposito).
    data_conclusao: Mapped[date | None] = mapped_column(Date)
    # Texto livre por enquanto -- mesmo padrao de autor_nome em EventoMarco
    # (login fica pra depois, ver _compor_observacao no router).
    responsavel: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
