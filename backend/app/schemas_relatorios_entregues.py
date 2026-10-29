"""Contrato da prévia e da extração de equipamentos entregues (uma linha por unidade)."""

from datetime import date

from pydantic import BaseModel, ConfigDict


class RegistroEntregue(BaseModel):
    model_config = ConfigDict(frozen=True)

    instrumento: str
    convenente: str
    tipo: str
    uf: str | None
    municipio: str | None
    cnes: str | None
    ano: int | None = None
    programa: str | None = None
    item: str
    familia: str | None = None
    ordem: int
    marca: str | None = None
    modelo: str | None = None
    numero_serie: str | None = None
    vida_util_anos: int | None = None
    data_entrega: date


class PreviaEntregues(BaseModel):
    total: int
    pagina: int
    limite: int
    itens: list[RegistroEntregue]
