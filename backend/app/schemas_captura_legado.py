"""Base recuperada da recaptura; não substitui a prova completa de promoção.

Filhas financeiras, Portal e hashes da rodada ainda precisam ser recuperados
para compor CapturaLegadoParaPromocao. Este contrato não habilita aprovação.
"""

from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas_identidade_legado import NumeroConvenioLegado
from app.schemas_legado import ItemDump
from app.schemas_programas_legado import ProgramasLegadoRecapturados


class ConvenioRecapturado(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow", str_strip_whitespace=True)
    NR_CONVENIO: NumeroConvenioLegado
    ID_PROPOSTA: str = Field(pattern=r"^[0-9]+$")
    SIT_CONVENIO: str = Field(min_length=1)
    VL_GLOBAL_CONV: str

    @field_validator("VL_GLOBAL_CONV")
    @classmethod
    def valor_global_valido(cls, valor: str) -> str:
        try:
            numero = Decimal(valor.replace(",", "."))
        except InvalidOperation as exc:
            raise ValueError("Valor global oficial inválido.") from exc
        if not numero.is_finite() or numero < 0:
            raise ValueError("Valor global oficial inválido.")
        return valor


class ItemRecapturado(ItemDump):
    model_config = ConfigDict(frozen=True, extra="allow")


class CapturaLegadoBasica(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    convenio: ConvenioRecapturado
    itens: tuple[ItemRecapturado, ...]
    programas: ProgramasLegadoRecapturados | None = None

    @model_validator(mode="after")
    def prova_coerente(self) -> "CapturaLegadoBasica":
        # Componente prioritário e escopo MS são decisões de domínio separadas.
        if not self.itens and (self.programas is None or not self.programas.catalogo):
            raise ValueError("Recaptura exige itens ou programas oficiais vinculados.")
        ids = [i.ID_ITEM_PAD for i in self.itens]
        if len(ids) != len(set(ids)):
            raise ValueError("Recaptura contém itens duplicados.")
        proposta = self.convenio.ID_PROPOSTA
        if any(i.ID_PROPOSTA != proposta for i in self.itens) or (
            self.programas is not None and any(v.ID_PROPOSTA != proposta for v in self.programas.vinculos)
        ):
            raise ValueError("Recaptura contém evidências de outra proposta.")
        return self
