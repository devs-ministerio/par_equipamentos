"""Vínculos oficiais proposta→programa e variantes publicadas do catálogo."""

from pydantic import BaseModel, ConfigDict, Field, model_validator


class VinculoProgramaRecapturado(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow", str_strip_whitespace=True)
    ID_PROPOSTA: str = Field(pattern=r"^[0-9]+$")
    ID_PROGRAMA: str = Field(pattern=r"^[0-9]+$")


class ProgramaRecapturado(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow", str_strip_whitespace=True)
    ID_PROGRAMA: str = Field(pattern=r"^[0-9]+$")
    NOME_PROGRAMA: str = Field(min_length=1)


class ProgramasLegadoRecapturados(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    vinculos: tuple[VinculoProgramaRecapturado, ...]
    catalogo: tuple[ProgramaRecapturado, ...]

    @model_validator(mode="after")
    def vinculos_integros(self) -> "ProgramasLegadoRecapturados":
        chaves = [(v.ID_PROPOSTA, v.ID_PROGRAMA) for v in self.vinculos]
        if len(chaves) != len(set(chaves)):
            raise ValueError("Vínculo proposta/programa duplicado.")
        if {v.ID_PROGRAMA for v in self.vinculos} != {p.ID_PROGRAMA for p in self.catalogo}:
            raise ValueError("Catálogo de programas não corresponde aos vínculos capturados.")
        return self
