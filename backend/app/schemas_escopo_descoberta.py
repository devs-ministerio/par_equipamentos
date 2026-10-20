"""Identidades exatas e evidência institucional da descoberta SICONV."""

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.services.criterios_descoberta import componente_prioritario


class PropostaEscopo(BaseModel):
    model_config = ConfigDict(frozen=True)
    ID_PROPOSTA: str = Field(pattern=r"^[0-9]+$")
    COD_ORGAO_SUP: str = Field(pattern=r"^[0-9]+$")


class ProgramaEscopo(BaseModel):
    model_config = ConfigDict(frozen=True)
    ID_PROGRAMA: str = Field(pattern=r"^[0-9]+$")
    COD_ORGAO_SUP_PROGRAMA: str = Field(pattern=r"^[0-9]+$")
    NOME_PROGRAMA: str = Field(min_length=1)


class VinculoProgramaProposta(BaseModel):
    model_config = ConfigDict(frozen=True)
    ID_PROPOSTA: str = Field(pattern=r"^[0-9]+$")
    ID_PROGRAMA: str = Field(pattern=r"^[0-9]+$")


class ComponenteDescoberto(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    id_programa: str = Field(pattern=r"^[0-9]+$")
    nome_programa: str = Field(min_length=1)
    componente: str = Field(min_length=1)

    @model_validator(mode="after")
    def validar_componente(self) -> "ComponenteDescoberto":
        if componente_prioritario(self.nome_programa) != self.componente:
            raise ValueError("Componente não corresponde ao nome integral do programa oficial.")
        return self
