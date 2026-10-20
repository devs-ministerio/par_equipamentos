"""Identidade estrita na descoberta; não substitui o contrato do detalhe."""

from pydantic import BaseModel, ConfigDict, Field


class IdentidadePropostaDescoberta(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True, extra="allow")
    id_proposta: int = Field(gt=0)
