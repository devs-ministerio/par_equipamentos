"""Candidato do Radar e confirmação no Portal: evidência textual não é inclusão na carteira."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.pipeline.portal_transparencia import ConvenioPortalTransparencia
from app.schemas_escopo_descoberta import ComponenteDescoberto
from app.schemas_identidade_legado import NumeroConvenioLegado
from app.schemas_legado import ItemDump as ItemDump


class ConvenioDump(BaseModel):
    model_config = ConfigDict(frozen=True)
    ID_PROPOSTA: str = Field(pattern=r"^[0-9]+$")
    NR_CONVENIO: NumeroConvenioLegado


class EvidenciaLegado(BaseModel):
    model_config = ConfigDict(frozen=True)
    id_item: str
    codigo_equipamento: str
    descricao: str
    relacao: Literal["aquisicao", "modernizacao", "existente", "mencao"]


class CandidatoLegado(BaseModel):
    model_config = ConfigDict(frozen=True)
    numero: NumeroConvenioLegado
    id_proposta: str = Field(pattern=r"^[0-9]+$")
    evidencias: tuple[EvidenciaLegado, ...]
    componentes: tuple[ComponenteDescoberto, ...] = ()
    confirmacao_portal: Literal["nao_consultado", "nao_encontrado", "sem_publicacao", "confirmado"] = "nao_consultado"
    data_publicacao: date | None = None
    criterio_escopo: Literal["prioritarios_ms_v1", "prioritarios_ms_celebrados_v2"] | None = None
    orgao_superior: Literal["36000"] | None = None
    data_assinatura_siconv: date | None = None
    data_publicacao_siconv: date | None = None

    @model_validator(mode="after")
    def validar_escopo(self) -> "CandidatoLegado":
        if self.componentes and self.criterio_escopo is None:
            raise ValueError("Evidência de componente exige escopo institucional oficial.")
        if (self.criterio_escopo is None) != (self.orgao_superior is None):
            raise ValueError("Critério prioritário exige identificação do Ministério da Saúde.")
        if self.criterio_escopo == "prioritarios_ms_celebrados_v2" and (
            self.data_assinatura_siconv is None or self.data_publicacao_siconv is None
        ):
            raise ValueError("Convênio celebrado exige assinatura e publicação oficiais.")
        return self


class DimConvenioConfirmacao(BaseModel):
    """Só a identidade: confirmar não consome `numero` nem `objeto`, então não os exige.

    O contrato completo (`DimConvenioPortal`) continua valendo onde o dado entra de fato (recaptura e aprovação).
    Um registro do Portal com `numero`/`objeto` vazios ainda confirma publicação.
    """

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    codigo: NumeroConvenioLegado

    @field_validator("codigo", mode="before")
    @classmethod
    def codigo_textual(cls, valor: str | int) -> str:
        return str(valor)


class PublicacaoPortal(BaseModel):
    dimConvenio: DimConvenioConfirmacao
    dataPublicacao: str | None = None


def confirmar_no_portal(candidato: CandidatoLegado, portal: ConvenioPortalTransparencia | None) -> CandidatoLegado:
    if portal is None:
        return candidato.model_copy(update={"confirmacao_portal": "nao_encontrado"})
    publicacao = PublicacaoPortal.model_validate(portal.model_dump())
    if str(publicacao.dimConvenio.codigo) != candidato.numero:
        raise ValueError("Portal retornou identidade diferente do convênio solicitado.")
    if not publicacao.dataPublicacao:
        return candidato.model_copy(update={"confirmacao_portal": "sem_publicacao"})
    try:
        data_publicacao = date.fromisoformat(publicacao.dataPublicacao)
    except ValueError:
        data_publicacao = datetime.strptime(publicacao.dataPublicacao, "%d/%m/%Y").date()
    return candidato.model_copy(update={"confirmacao_portal": "confirmado", "data_publicacao": data_publicacao})
