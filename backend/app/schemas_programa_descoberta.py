"""Prova institucional da API Gestão de Parcerias; extras preservam a fonte."""

from pydantic import BaseModel, ConfigDict, Field


class ProgramaDescobertaTransfereGov(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True, extra="allow")
    id_programa: int = Field(gt=0)
    nm_programa: str = Field(min_length=1)
    sg_ente_superior: str | None = None
