"""Schemas Pydantic -- formato de entrada/saida da API. Crescem
organicamente conforme os modulos seguintes adicionam endpoints; aqui vai
so o que o Modulo 1 (infraestrutura) e o Modulo 2 (autenticacao) ja
precisam.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.models import DeficitStatus, UserRole, UserStatus


# ----------------------------------------------------------------------------
# Erro padronizado (ver app/errors.py)
# ----------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None


# ----------------------------------------------------------------------------
# Usuario / autenticacao
# ----------------------------------------------------------------------------

class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: UserRole
    status: UserStatus
    created_at: datetime


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    cpf: str  # texto puro so nessa entrada -- vira cpf_hash antes de tocar o banco (RF-25)
    role: UserRole = UserRole.colaborador


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str  # user id, como string (padrao do JWT)
    role: UserRole
    exp: int


# ----------------------------------------------------------------------------
# Leitura de resultado (macro_coverage / equipment_offer_row)
# ----------------------------------------------------------------------------

class MacroCoverageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    execution_id: int
    macro_code: str
    macro_name: str
    state: str
    equipment_family: str
    population: int | None  # SUS-dependente (IBGE - ANS) -- denominador da demanda usado no calculo
    population_residente: int | None  # so informativo (IBGE total, ao vivo do SIDRA)
    population_ans: int | None  # so informativo (beneficiarios de plano de saude, arquivo de referencia)
    estimated_need: float | None
    required_qty: int | None
    available_qty: int | None
    existing_qty: int | None
    facility_count: int | None
    balance: int | None
    deficit_status: DeficitStatus
    # derivado (available_qty / required_qty * 100) -- nao e coluna do banco,
    # calculado no router pra nao duplicar essa conta no frontend.
    coverage_percentage: float | None = None


class MunicipalityCoverageRead(BaseModel):
    """Mesmo shape de MacroCoverageRead, granularizado por municipio --
    alimenta a tabela Cobertura Assistencial quando o filtro escolhido
    afunila ate Municipio/CNES."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    execution_id: int
    ibge_code: str
    municipality_name: str
    health_region_code: str | None
    health_region_name: str | None
    macro_code: str | None
    macro_name: str | None
    state: str
    equipment_family: str
    population: int | None
    population_residente: int | None
    population_ans: int | None
    estimated_need: float | None
    required_qty: int | None
    available_qty: int | None
    existing_qty: int | None
    facility_count: int | None
    balance: int | None
    deficit_status: DeficitStatus
    coverage_percentage: float | None = None


class HealthRegionCoverageRead(BaseModel):
    """Agregado de MunicipalityCoverageRead por regiao de saude, computado em
    tempo de leitura (GROUP BY health_region_code) -- alimenta a tabela
    Cobertura Assistencial quando o filtro escolhido e Regiao de Saude (sem
    afunilar ate Municipio/CNES). Sem `id` proprio (nao e uma linha
    persistida) nem `ibge_code`/`municipality_name` (nao se aplicam a esse
    nivel)."""

    health_region_code: str
    health_region_name: str
    macro_code: str | None
    macro_name: str | None
    state: str
    equipment_family: str
    population: int | None
    population_residente: int | None
    population_ans: int | None
    estimated_need: float | None
    required_qty: int | None
    available_qty: int | None
    existing_qty: int | None
    facility_count: int | None
    balance: int | None
    deficit_status: DeficitStatus
    coverage_percentage: float | None = None


class EquipmentOfferRowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    execution_id: int
    cnes_code: str
    facility_name: str | None
    ibge_code: str
    municipality_name: str | None
    macro_code: str | None
    macro_name: str | None
    health_region_code: str | None
    health_region_name: str | None
    state: str
    equipment_family: str
    equipment_subtype: str | None
    existing_qty: int
    in_use_qty: int
    sus_flag: bool


class EquipmentOfferRowPage(BaseModel):
    items: list[EquipmentOfferRowRead]
    total: int


class EquipmentType(BaseModel):
    tipo: str
    qtd: int


class EstablishmentRead(BaseModel):
    """Estabelecimento agregado por CNES -- um CNES pode ter mais de uma
    linha em equipment_offer_row (subtipos diferentes do mesmo equipamento);
    isso ja vem somado, com `types` guardando a quebra por subtipo."""

    cnes_code: str
    facility_name: str | None
    municipality_name: str | None
    macro_code: str | None
    macro_name: str | None
    health_region_code: str | None
    health_region_name: str | None
    state: str
    existing_qty: int
    in_use_qty: int
    sus_flag: bool
    types: list[EquipmentType]


class EstablishmentPage(BaseModel):
    items: list[EstablishmentRead]
    total: int


class MunicipalityRead(BaseModel):
    """Municipio real (com sua macro de saude e UF) -- usado pra alimentar o
    filtro de Municipio e, a partir dele, restringir a tabela de cobertura
    (que e agregada por macro) a so a(s) macro(s) do municipio escolhido.
    UF entra porque varios municipios brasileiros compartilham nome entre
    estados diferentes (ex.: Santa Rita existe na PB e no MA) -- sem ela o
    filtro seria ambiguo."""

    name: str
    state: str
    macro_code: str | None


class EquipmentTotalsRead(BaseModel):
    """Soma exata de equipment_offer_row pro recorte de filtro pedido --
    diferente de MacroCoverage (agregado so por macro), da o total certo pra
    qualquer granularidade (UF, macro, regiao de saude, municipio ou CNES)."""

    existing_qty: int
    available_qty: int  # so linhas com sus_flag=true -- mesma regra de "oferta" do macro_coverage


class FacilityOptionRead(BaseModel):
    """Estabelecimento minimo (sem quantidades) usado so pra alimentar o
    filtro principal de CNES e, no front, derivar (100% no cliente) as
    opcoes de todos os outros filtros de forma bidirecional -- selecionar
    qualquer filtro (inclusive CNES) passa a restringir os demais, porque
    todos derivam da mesma lista completa."""

    cnes_code: str
    facility_name: str | None
    state: str
    macro_code: str | None
    macro_name: str | None
    health_region_code: str | None
    health_region_name: str | None
    municipality_name: str | None


class HealthRegionRead(BaseModel):
    """Regiao de saude real (com sua macro e UF) -- usado pra alimentar o
    filtro de Regiao de Saude. Diferente de municipio, regiao de saude tem
    codigo proprio (do DEMAS), entao o filtro usa o codigo direto como valor
    (nao precisa de chave composta nome+UF)."""

    code: str
    name: str
    state: str
    macro_code: str | None
