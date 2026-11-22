"""Contratos HTTP da confirmação de repasse e da fase calculada do acompanhamento."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TipoRepasse = Literal["integral", "parcial"]
OrigemRepasse = Literal["fonte", "manual"]


class RepasseCreate(BaseModel):
    tipo: TipoRepasse
    justificativa: str | None = Field(default=None, max_length=1000)


class RepasseRead(BaseModel):
    id: int
    tipo: TipoRepasse
    origem: OrigemRepasse
    justificativa: str | None
    autor_id: int | None
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)


class SituacaoRepasseRead(BaseModel):
    """`repasse` é o confirmado vigente (manual prevalece sobre a fonte); None pede a confirmação."""

    repasse: RepasseRead | None
    repasse_previsto: bool
    fase_calculada: str
