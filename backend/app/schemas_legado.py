"""Contratos explícitos do Radar legado; sem payload federal cru na API."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas_escopo_descoberta import ComponenteDescoberto

ConfirmacaoPortal = Literal["nao_consultado", "nao_encontrado", "sem_publicacao", "confirmado"]
SituacaoLegado = Literal["novo", "em_analise", "aprovado", "rejeitado"]


class ItemDump(BaseModel):
    model_config = ConfigDict(frozen=True)
    ID_PROPOSTA: str = Field(pattern=r"^[0-9]+$")
    ID_ITEM_PAD: str = Field(pattern=r"^[0-9]+$")
    DESCRICAO_ITEM: str


class EvidenciaLegadoRead(BaseModel):
    id_item: str
    codigo: str
    nome: str
    descricao: str
    relacao: Literal["aquisicao", "modernizacao", "existente", "mencao"]


class ItemPlanoLegadoRead(BaseModel):
    """Bem do plano de aplicação, como veio na última recaptura oficial."""

    nome: str
    quantidade: str | None = None
    valor_unitario: str | None = None
    valor_total: str | None = None


class CandidatoLegadoRead(BaseModel):
    id: int
    numero: str
    id_proposta: str
    confirmacao_portal: ConfirmacaoPortal
    data_publicacao: date | None
    origem: Literal["siconv_oficial"]
    descoberto_em: datetime
    verificado_em: datetime
    evidencias: list[EvidenciaLegadoRead]
    componentes: list[ComponenteDescoberto] = Field(default_factory=list)
    captura_id: int
    situacao: SituacaoLegado
    versao: int
    # Vêm da última recaptura oficial; nulos enquanto ela não existe.
    valor_global: Decimal | None = None
    municipio: str | None = None
    uf: str | None = None
    numero_processo: str | None = None
    data_instrumento: date | None = None
    # Horário da última recaptura (prova da aprovação); nulo se nunca houve.
    recaptura_em: datetime | None = None
    # Nomes dos bens do plano (recaptura) ou, sem ela, dos equipamentos reconhecidos na descoberta.
    itens: list[ItemPlanoLegadoRead] = Field(default_factory=list)


class CandidatosLegadosRead(BaseModel):
    total: int
    novos: int
    itens: list[CandidatoLegadoRead]


class DecisaoLegadoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    acao: Literal["rejeitar"]
    chave: UUID
    captura_id: int = Field(gt=0)
    versao: int = Field(ge=0)
    justificativa: str = Field(min_length=3, max_length=1000)


class DecisaoLegadoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    candidato_id: int
    captura_id: int
    usuario_id: int
    situacao_anterior: SituacaoLegado
    situacao: SituacaoLegado
    justificativa: str
    criado_em: datetime


class HistoricoLegadoItem(DecisaoLegadoRead):
    usuario_nome: str


class HistoricoLegadoRead(BaseModel):
    total: int
    itens: list[HistoricoLegadoItem]


class ReferenciaDescoberta(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    origem: Literal["siconv_oficial"]
    hash_snapshot: str = Field(pattern=r"^[a-f0-9]{64}$")
