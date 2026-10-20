"""Valida campos consumidos pelo espelho sem descartar o payload original."""

from datetime import date, datetime
from math import isfinite

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CamposPropostaTransfereGov(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    id_proposta: int = Field(gt=0)
    id_programa: int | None = Field(default=None, gt=0)
    cnpj_ente_recebedor: str = Field(pattern=r"^[0-9]{14}$")
    nm_ente_recebedor: str = Field(min_length=1)
    ds_objeto: str | None = None
    nm_municipio_recebedor: str | None = None
    sg_uf_recebedor: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    situacao_proposta: str | None = None
    dt_proposta: str | None = None
    vl_total_planejamento_gastos: int | float | None = None

    @field_validator("nm_ente_recebedor")
    @classmethod
    def nome_nao_vazio(cls, valor: str) -> str:
        if not valor.strip():
            raise ValueError("Nome oficial vazio.")
        return valor

    @field_validator("vl_total_planejamento_gastos", mode="before")
    @classmethod
    def valor_finito_nao_negativo(cls, valor: object) -> object:
        if valor is None:
            return None
        if isinstance(valor, bool) or not isinstance(valor, (int, float)):
            raise ValueError("Valor oficial inválido.")
        if valor < 0 or (isinstance(valor, float) and not isfinite(valor)):
            raise ValueError("Valor oficial inválido.")
        return valor

    @field_validator("dt_proposta")
    @classmethod
    def data_iso_valida(cls, valor: str | None) -> str | None:
        if valor is not None:
            date.fromisoformat(valor[:10])
            if len(valor) > 10:
                datetime.fromisoformat(valor)
        return valor
