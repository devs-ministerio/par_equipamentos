"""Seleção explícita e limitada de propostas conhecidas para aceite local."""

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator


class AmostraTransfereGov(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    proposta_ids: tuple[StrictInt, ...] = Field(min_length=1, max_length=5)

    @field_validator("proposta_ids")
    @classmethod
    def identidades_validas(cls, ids: tuple[int, ...]) -> tuple[int, ...]:
        if any(i <= 0 or i > 2**63 - 1 for i in ids) or len(set(ids)) != len(ids):
            raise ValueError("Amostra requer IDs positivos, únicos e compatíveis com o banco.")
        return ids
