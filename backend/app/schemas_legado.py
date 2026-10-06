"""Contratos explícitos do Radar legado; sem payload federal cru na API."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ConfirmacaoPortal = Literal["nao_consultado", "nao_encontrado", "sem_publicacao", "confirmado"]


class EvidenciaLegadoRead(BaseModel):
    id_item: str
    codigo: str
    nome: str
    descricao: str
    relacao: Literal["aquisicao", "modernizacao", "existente", "mencao"]


class CandidatoLegadoRead(BaseModel):
    id: int
    numero: str
    id_proposta: str
    confirmacao_portal: ConfirmacaoPortal
    data_publicacao: date | None
    origem: Literal["snapshot_local", "siconv_oficial"]
    descoberto_em: datetime
    verificado_em: datetime
    evidencias: list[EvidenciaLegadoRead]


class CandidatosLegadosRead(BaseModel):
    total: int
    itens: list[CandidatoLegadoRead]


class ReferenciaDescoberta(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    origem: Literal["snapshot_local", "siconv_oficial"]
    hash_snapshot: str = Field(pattern=r"^[a-f0-9]{64}$")
