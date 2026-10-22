"""Contratos internos do worker; não aceitam payload enviado pelo navegador."""

from pydantic import BaseModel, ConfigDict, Field

from app.schemas_identidade_legado import NumeroConvenioLegado
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao, OrigemRecapturaColetada
from app.schemas_recaptura_persistencia import ReferenciaRecaptura


class AlvoRecapturaLegado(ReferenciaRecaptura):
    numero: NumeroConvenioLegado
    id_proposta: str = Field(pattern=r"^[0-9]+$")


class PacoteRecapturaLegado(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    captura: CapturaLegadoParaPromocao
    origem: OrigemRecapturaColetada
