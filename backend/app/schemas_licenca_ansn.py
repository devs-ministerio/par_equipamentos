"""Contratos HTTP da licença de operação do instrumento (fonte oficial: ANSN)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel

SituacaoLicenca = Literal["valida", "suspensa", "nao_consta"]


class LicencaVinculoRead(BaseModel):
    matricula: str
    designacao: str | None
    cidade: str | None
    uf: str | None
    area: str | None
    situacao: SituacaoLicenca
    validade: date | None
    dias: int | None


class LicencaOperacaoRead(BaseModel):
    """Licença de operação do instrumento: vale pelo estabelecimento (CNES), nunca pelo equipamento."""

    exige: bool
    cnes: str | None
    sem_cnes: bool
    areas_exigidas: list[str]
    areas_sem_vinculo: list[str]
    vinculos: list[LicencaVinculoRead]
    ultima_carga: date | None
