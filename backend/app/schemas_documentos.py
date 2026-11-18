"""Schemas dos documentos do instrumento (NF, OS, TRP, TRD, SCRA e licença da CNEN)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

TipoDocumento = Literal["nota_fiscal", "ordem_servico", "trp", "trd", "cnen_scra", "cnen_licenca"]
StatusCnen = Literal["Em análise", "Em diligência", "Deferido", "Indeferido"]
TIPOS_CNEN = ("cnen_scra", "cnen_licenca")


class DocumentoCreate(BaseModel):
    tipo: TipoDocumento
    numero: str | None = Field(default=None, max_length=100)
    data_documento: date
    status: StatusCnen | None = None
    data_validade: date | None = None
    observacao: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _coerencia(self) -> "DocumentoCreate":
        if self.status is not None and self.tipo not in TIPOS_CNEN:
            raise ValueError("O status só vale para documentos da CNEN.")
        if self.data_validade is not None and self.tipo != "cnen_licenca":
            raise ValueError("A validade só vale para a licença de operação.")
        return self


class DocumentoExclusao(BaseModel):
    motivo: str = Field(min_length=5, max_length=1000)


class DocumentoRead(BaseModel):
    id: int
    tipo: TipoDocumento
    numero: str | None
    data_documento: date
    status: str | None
    data_validade: date | None
    observacao: str | None


class DocumentosInstrumentoRead(BaseModel):
    nr_convenio: str
    pode_editar: bool
    documentos: list[DocumentoRead]
