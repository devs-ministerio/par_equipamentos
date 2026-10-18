"""Vivacidade do processo, sem abrir sessão ou consultar o banco."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

router = APIRouter(tags=["health"])


class HealthLiveRead(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    status: Literal["ok"] = "ok"


@router.get("/health/live", response_model=HealthLiveRead)
def live() -> HealthLiveRead:
    """HTTP responsivo não significa banco disponível; /health continua real."""
    return HealthLiveRead()
