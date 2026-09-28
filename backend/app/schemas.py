"""Schemas Pydantic -- formato de entrada/saida da API. Crescem
organicamente conforme os modulos seguintes adicionam endpoints; aqui vai
so o que o Modulo 1 (infraestrutura) e o Modulo 2 (autenticacao) ja
precisam.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BaseModel, ConfigDict

from app.db.models import DeficitStatus, NotificacaoTipo, UserRole, UserStatus

# ----------------------------------------------------------------------------
# Usuario / autenticacao
# ----------------------------------------------------------------------------

# TLDs reservados (RFC 2606) que a lib email_validator rejeita por padrao
# (erro "special-use or reserved name") mas que precisam ser aceitos aqui --
# achado da auditoria visual do Plan Mode frontend 2026-09-17 (P0 #10):
# a credencial administrativa usa domínio ".local", e login/UserRead
# rejeitavam com 422 (UI mostrava "[object Object]"). Continua rejeitando
# e-mail malformado nos demais casos -- so pula a checagem de
# deliverability/TLD publico pra esses sufixos especificos.
_TLDS_RESERVADOS_ACEITOS = {"local"}
_EMAIL_SINTAXE_BASICA = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validar_email(v: str) -> str:
    try:
        return validate_email(v, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        dominio = v.rsplit("@", 1)[-1].lower() if "@" in v else ""
        tld = dominio.rsplit(".", 1)[-1] if "." in dominio else dominio
        if tld in _TLDS_RESERVADOS_ACEITOS and _EMAIL_SINTAXE_BASICA.match(v):
            return v
        raise ValueError(str(exc)) from exc


EmailStr = Annotated[str, AfterValidator(_validar_email)]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: UserRole
    status: UserStatus
    created_at: datetime
    activated_at: datetime | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ----------------------------------------------------------------------------
# Gestao de usuarios (Modulo Admin, 2026-09-17 -- ver app/routers/usuarios.py,
# app/services/usuarios.py)
# ----------------------------------------------------------------------------


def _validar_senha(v: str) -> str:
    if len(v) < 10:
        raise ValueError("A senha precisa ter pelo menos 10 caracteres.")
    return v


SenhaStr = Annotated[str, AfterValidator(_validar_senha)]


class UserCreateRequest(BaseModel):
    name: str
    email: EmailStr
    role: UserRole
    password: SenhaStr | None = None


class UserActivationRequest(BaseModel):
    token: Annotated[str, AfterValidator(lambda v: v.strip())]
    password: SenhaStr


class PasswordRecoveryRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    token: Annotated[str, AfterValidator(lambda v: v.strip())]
    password: SenhaStr


class UserUpdateRequest(BaseModel):
    name: str
    role: UserRole


class UserListResponse(BaseModel):
    itens: list[UserRead]
    total: int


# ----------------------------------------------------------------------------
# Notificacoes (ver app/routers/notificacoes.py, app/services/notificacoes.py)
# ----------------------------------------------------------------------------


class NotificacaoRead(BaseModel):
    id: int
    tipo: NotificacaoTipo
    titulo: str
    corpo: str | None
    entidade_id: int
    nivel_minimo: str | None
    lida: bool
    created_at: datetime
    destino: str | None = None

    model_config = ConfigDict(from_attributes=True)


class NotificacoesListRead(BaseModel):
    itens: list[NotificacaoRead]
    total: int
    nao_lidas: int


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
    # So informativo (nao entra em deficit_status) -- ver comentario em
    # app/pipeline/geo.py e app/db/models.py. Nulo pra familias cujo
    # pipeline ainda nao calcula (so TOMOGRAFO por enquanto).
    distance_km_nearest_equipment: float | None = None
    # Idem, mas ate o produtor de radiofarmaco PET mais proximo (FDG) --
    # so informativo, nulo pra familias diferentes de PET_CT. Ver
    # app/pipeline/radiofarmaco.py e app/db/models.py. hours_road/hours_air
    # sao ESTIMATIVA por formula (sem API de roteamento), nao rota real.
    distance_km_nearest_radiopharma: float | None = None
    hours_road_nearest_radiopharma: float | None = None
    hours_air_nearest_radiopharma: float | None = None
    # Coordenada da SEDE do municipio (mesmo CSV vendorizado usado pra
    # calcular distance_km_nearest_equipment, ver app/pipeline/geo.py) --
    # decorado em tempo de leitura no router, nao e coluna do banco. Alimenta
    # o mapa "recorte da macrorregiao" quando o usuario escolhe centralizar o
    # raio de 75 km no proprio municipio em vez de em cada estabelecimento
    # (2026-08-23). Nulo so se o municipio nao bater com o CSV (nao deveria
    # acontecer, ja validado 5570/5570).
    latitude: float | None = None
    longitude: float | None = None
    # Codigo IBGE de 7 digitos (com digito verificador) -- decorado do
    # mesmo CSV (ver app/pipeline/geo.py::carregar_codigo_ibge_7_digitos).
    # Usado pelo front pra buscar o contorno REAL do municipio (poligono
    # oficial, nao raio/circulo) na API de malhas do IBGE, que exige esse
    # formato de codigo em vez do de 6 digitos que o resto do sistema usa.
    ibge_code_7: str | None = None


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
    latitude: float | None
    longitude: float | None
    legal_nature: str | None


class PageMeta(BaseModel):
    """Envelope de paginação real (Plan Mode fechamento final 2026-09-25,
    Bloco 1) -- só usado pelas rotas com offset/limit de verdade
    (equipment-offer-rows e establishments). As demais listagens do app são
    teto de segurança, não paginação de UI (ver comentário em cada router),
    e continuam devolvendo `list[X]` puro."""

    total: int


class EquipmentOfferRowPage(BaseModel):
    data: list[EquipmentOfferRowRead]
    meta: PageMeta


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
    latitude: float | None
    longitude: float | None
    legal_nature: str | None
    types: list[EquipmentType]


class EstablishmentPage(BaseModel):
    data: list[EstablishmentRead]
    meta: PageMeta


class EquipmentTotalsRead(BaseModel):
    """Soma exata de equipment_offer_row pro recorte de filtro pedido --
    diferente de MacroCoverage (agregado so por macro), da o total certo pra
    qualquer granularidade (UF, macro, regiao de saude, municipio ou CNES)."""

    existing_qty: int
    available_qty: int  # so linhas com sus_flag=true -- mesma regra de "oferta" do macro_coverage


class LegalNatureBreakdownRead(BaseModel):
    """Quebra de equipment_offer_row por natureza juridica do estabelecimento
    (Publico/Privado/Sem fins lucrativos) -- Painel Geral, card "Natureza
    juridica da oferta SUS" (2026-08-22): quase metade da capacidade SUS de
    Tomografo vem de estabelecimento Privado, nao de infraestrutura propria
    do SUS -- risco que nao aparecia em lugar nenhum antes."""

    legal_nature: str  # "NAO_INFORMADO" quando o campo vem nulo do CNES
    existing_qty: int
    available_qty: int  # so linhas com sus_flag=true


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
