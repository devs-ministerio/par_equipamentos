"""Datas oficiais do instrumento: número reservado não comprova celebração."""

from datetime import date, datetime

from pydantic import ConfigDict, field_validator

from app.services.descoberta_legado import ConvenioDump


class ConvenioCelebracaoSiconv(ConvenioDump):
    model_config = ConfigDict(frozen=True)
    DIA_ASSIN_CONV: date | None
    DIA_PUBL_CONV: date | None
    SIT_CONVENIO: str

    @field_validator("DIA_ASSIN_CONV", "DIA_PUBL_CONV", mode="before")
    @classmethod
    def data_oficial(cls, valor: str | date | None) -> date | None:
        if valor is None or valor == "":
            return None
        if isinstance(valor, date):
            return valor
        return datetime.strptime(valor, "%d/%m/%Y").date()

    @property
    def celebrado(self) -> bool:
        return bool(
            self.DIA_ASSIN_CONV
            and self.DIA_PUBL_CONV
            and self.SIT_CONVENIO.strip()
            and "proposta" not in self.SIT_CONVENIO.casefold()
        )
