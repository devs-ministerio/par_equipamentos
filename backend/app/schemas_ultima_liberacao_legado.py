"""Última liberação publicada pelo Portal; não é um total financeiro SICONV."""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, ConfigDict, field_validator


class UltimaLiberacaoPortal(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")
    dataUltimaLiberacao: date | None = None
    valorDaUltimaLiberacao: Decimal | None = None

    @field_validator("dataUltimaLiberacao", mode="before")
    @classmethod
    def data_publicada(cls, valor: str | date | None) -> str | date | None:
        if valor is None or valor == "":
            return None
        if not isinstance(valor, (str, date)):
            raise ValueError("Data de última liberação inválida.")
        if isinstance(valor, str) and "/" in valor:
            return datetime.strptime(valor, "%d/%m/%Y").date()
        return valor

    @field_validator("valorDaUltimaLiberacao", mode="before")
    @classmethod
    def valor_publicado(cls, valor: str | int | float | Decimal | None) -> Decimal | None:
        if valor is None or valor == "":
            return None
        if isinstance(valor, bool) or not isinstance(valor, (str, int, float, Decimal)):
            raise ValueError("Valor de última liberação inválido.")
        try:
            numero = Decimal(str(valor).replace(",", "."))
        except InvalidOperation as exc:
            raise ValueError("Valor de última liberação inválido.") from exc
        if not numero.is_finite():
            raise ValueError("Valor de última liberação inválido.")
        return numero
