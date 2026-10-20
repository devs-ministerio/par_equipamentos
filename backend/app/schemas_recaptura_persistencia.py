"""Referência interna do coletor e resultado sem payload federal na UI."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReferenciaRecaptura(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    candidato_id: int = Field(gt=0, strict=True)
    captura_id: int = Field(gt=0, strict=True)


class RecapturaPersistida(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)
    id: int
    candidato_id: int
    captura_id: int
    fonte_captura_id: int
    hash_conteudo: str
    criado_em: datetime
