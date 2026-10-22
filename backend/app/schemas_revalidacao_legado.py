"""Prova interna de escopo; não aceita uploads nem declarações da UI."""

from datetime import date, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas_celebracao_legado import ConvenioCelebracaoSiconv
from app.schemas_coleta_recaptura_legado import AlvoRecapturaLegado
from app.schemas_escopo_descoberta import ProgramaEscopo, PropostaEscopo, VinculoProgramaProposta
from app.schemas_legado import ItemDump

FONTES_ESCOPO = frozenset(
    {"siconv_convenio", "siconv_proposta", "siconv_plano_aplicacao", "siconv_programa_proposta", "siconv_programa"}
)


class ConvenioRevalidado(ConvenioCelebracaoSiconv):
    """DTO interno aceita round-trip JSON; CSV continua estrito no coletor."""

    @field_validator("DIA_ASSIN_CONV", "DIA_PUBL_CONV", mode="before")
    @classmethod
    def data_oficial(cls, valor: str | date | None) -> date | None:
        if valor is None or valor == "":
            return None
        if isinstance(valor, date):
            return valor
        return datetime.strptime(valor, "%d/%m/%Y").date() if "/" in valor else date.fromisoformat(valor)


class EscopoLegadoColetado(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    iniciado_em: AwareDatetime
    convenio: ConvenioRevalidado
    proposta: PropostaEscopo
    # Nenhum item devolvido não comprova inelegibilidade: exigir nova consulta.
    itens: tuple[ItemDump, ...] = Field(min_length=1, max_length=10_000)
    programas: tuple[ProgramaEscopo, ...] = Field(max_length=10_000)
    vinculos: tuple[VinculoProgramaProposta, ...] = Field(max_length=10_000)
    hashes: dict[str, str]
    payload_protegido_local: Literal[True]

    @model_validator(mode="after")
    def fontes_e_identidades_completas(self) -> "EscopoLegadoColetado":
        import re

        if set(self.hashes) != FONTES_ESCOPO or any(not re.fullmatch(r"[a-f0-9]{64}", h) for h in self.hashes.values()):
            raise ValueError("Revalidação exige as cinco fontes completas e seus hashes.")
        identidade = self.convenio.ID_PROPOSTA
        if self.proposta.ID_PROPOSTA != identidade or any(i.ID_PROPOSTA != identidade for i in self.itens):
            raise ValueError("Itens ou proposta divergem da identidade oficial.")
        if any(v.ID_PROPOSTA != identidade for v in self.vinculos):
            raise ValueError("Vínculo de programa pertence a outra proposta.")
        if {v.ID_PROGRAMA for v in self.vinculos} != {p.ID_PROGRAMA for p in self.programas}:
            raise ValueError("Catálogo oficial não corresponde aos vínculos consultados.")
        return self


class RevalidacaoPreparada(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    alvo: AlvoRecapturaLegado
    escopo: EscopoLegadoColetado


class RevalidacoesCiclo(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entradas: tuple[RevalidacaoPreparada, ...] = Field(max_length=1000)
    inconclusivos: tuple[int, ...] = Field(max_length=1000)

    @model_validator(mode="after")
    def candidatos_distintos(self) -> "RevalidacoesCiclo":
        ids = [e.alvo.candidato_id for e in self.entradas]
        if (
            len(ids) != len(set(ids))
            or len(self.inconclusivos) != len(set(self.inconclusivos))
            or set(ids) & set(self.inconclusivos)
        ):
            raise ValueError("Lote de revalidação contém candidatos repetidos ou ambíguos.")
        return self
