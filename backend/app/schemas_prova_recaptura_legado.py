"""Prova completa reconstruída; aprovação ainda exige persistência/auditoria."""

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas_captura_legado import CapturaLegadoBasica
from app.schemas_escopo_descoberta import PropostaEscopo
from app.schemas_filhas_legado import CHAVES_FILHAS, FilhasLegadoRecapturadas
from app.schemas_portal_legado import PortalLegadoCapturado
from app.schemas_programas_legado import ProgramasLegadoRecapturados


class PropostaInstitucionalSiconv(PropostaEscopo):
    model_config = ConfigDict(frozen=True, extra="allow")


class CapturaLegadoParaPromocao(CapturaLegadoBasica):
    portal: PortalLegadoCapturado
    filhas: FilhasLegadoRecapturadas
    programas: ProgramasLegadoRecapturados
    proposta: PropostaInstitucionalSiconv

    @model_validator(mode="after")
    def identidades_oficiais_coerentes(self) -> "CapturaLegadoParaPromocao":
        if self.portal.dimConvenio.codigo != self.convenio.NR_CONVENIO:
            raise ValueError("Portal e SICONV não correspondem ao mesmo convênio.")
        if self.proposta.ID_PROPOSTA != self.convenio.ID_PROPOSTA:
            raise ValueError("Proposta institucional diverge da identidade do convênio.")
        for campo in CHAVES_FILHAS:
            if any(r.NR_CONVENIO != self.convenio.NR_CONVENIO for r in getattr(self.filhas, campo)):
                raise ValueError("Captura contém tabela filha de outro convênio.")
        return self


class OrigemRecapturaColetada(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    iniciado_em: datetime
    hash_convenios: str = Field(pattern=r"^[a-f0-9]{64}$")
    hash_itens: str = Field(pattern=r"^[a-f0-9]{64}$")
    hash_proposta: str = Field(pattern=r"^[a-f0-9]{64}$")
    hashes_filhas: dict[str, str]
    hashes_programas: dict[str, str]
    payload_protegido_local: bool = Field(default=False, strict=True)

    @field_validator("iniciado_em")
    @classmethod
    def horario_com_fuso(cls, valor: datetime) -> datetime:
        if valor.tzinfo is None or valor.utcoffset() is None:
            raise ValueError("Rodada oficial exige horário com fuso.")
        return valor

    @model_validator(mode="after")
    def fontes_completas(self) -> "OrigemRecapturaColetada":
        for hashes, campos in (
            (self.hashes_filhas, set(CHAVES_FILHAS)),
            (self.hashes_programas, {"siconv_programa_proposta", "siconv_programa"}),
        ):
            if set(hashes) != campos or any(not re.fullmatch(r"[a-f0-9]{64}", h) for h in hashes.values()):
                raise ValueError("Hashes das fontes consultadas ausentes, incompletos ou inválidos.")
        return self
