"""Identificação do Portal; não substitui os totais financeiros do SICONV."""

import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.geo_reference import REGIAO_POR_UF
from app.schemas_identidade_legado import NumeroConvenioLegado


class DimConvenioPortal(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow", str_strip_whitespace=True)
    codigo: NumeroConvenioLegado
    numero: str = Field(min_length=1)
    objeto: str = Field(min_length=1)

    @field_validator("codigo", mode="before")
    @classmethod
    def codigo_textual(cls, valor: str | int) -> str:
        return str(valor)


class ConvenentePortal(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow", str_strip_whitespace=True)
    nome: str = Field(min_length=1)
    cnpjFormatado: str
    tipo: str | None = None

    @field_validator("cnpjFormatado")
    @classmethod
    def cnpj_normalizado(cls, valor: str) -> str:
        if not re.fullmatch(r"[0-9./\s-]+", valor):
            raise ValueError("CNPJ oficial inválido.")
        numeros = re.sub(r"\D", "", valor)
        if len(numeros) != 14:
            raise ValueError("CNPJ oficial inválido.")
        return numeros


class UfPortal(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow")
    nome: str

    @field_validator("nome")
    @classmethod
    def uf_oficial(cls, valor: str) -> str:
        if valor not in REGIAO_POR_UF:
            raise ValueError("Sigla oficial da UF inválida.")
        return valor


class MunicipioPortal(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow", str_strip_whitespace=True)
    nomeIBGE: str = Field(min_length=1)
    codigoIBGE: str | None = None
    nomeRegiao: str | None = None
    uf: UfPortal

    @field_validator("codigoIBGE", mode="before")
    @classmethod
    def codigo_textual(cls, valor: str | int | None) -> str | None:
        if valor is None or valor == "":
            return None
        codigo = str(valor)
        if not re.fullmatch(r"[0-9]+", codigo):
            raise ValueError("Código IBGE oficial inválido.")
        return codigo


class PortalLegadoCapturado(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow", str_strip_whitespace=True)
    dimConvenio: DimConvenioPortal
    convenente: ConvenentePortal
    municipioConvenente: MunicipioPortal
    dataPublicacao: date
    dataInicioVigencia: date | None = None
    dataFinalVigencia: date | None = None
    dataConclusao: date | None = None
    situacao: str | None = None
    numeroProcesso: str | None = None

    @field_validator("dataPublicacao", "dataInicioVigencia", "dataFinalVigencia", "dataConclusao", mode="before")
    @classmethod
    def data_oficial(cls, valor: str | date | None) -> str | date | None:
        if valor is None or valor == "":
            return None
        if not isinstance(valor, (str, date)):
            raise ValueError("Data oficial inválida.")
        if isinstance(valor, str) and "/" in valor:
            return datetime.strptime(valor, "%d/%m/%Y").date()
        return valor
