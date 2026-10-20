"""Descoberta diagnóstica: evidência textual não é inclusão na carteira."""

from collections.abc import Iterable
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.equipamentos import CATALOGO_EQUIPAMENTOS, classificar_descricoes
from app.pipeline.portal_transparencia import ConvenioPortalTransparencia
from app.schemas_escopo_descoberta import ComponenteDescoberto
from app.schemas_identidade_legado import NumeroConvenioLegado
from app.schemas_legado import ItemDump as ItemDump
from app.schemas_portal_legado import DimConvenioPortal


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


def descobrir_legado(
    convenios: Iterable[dict[str, str]],
    itens: Iterable[dict[str, str]],
    *,
    conhecidos: set[str],
) -> list[CandidatoLegado]:
    """Cruza IDs exatos; não usa CNPJ/nome e não inventa identificadores."""
    por_proposta: dict[str, str] = {}
    por_numero: dict[str, str] = {}
    for registro in convenios:
        convenio = ConvenioDump.model_validate(registro)
        anterior = por_proposta.setdefault(convenio.ID_PROPOSTA, convenio.NR_CONVENIO)
        if anterior != convenio.NR_CONVENIO:
            raise ValueError("Proposta SICONV vinculada a múltiplos convênios: cruzamento ambíguo.")
        proposta_anterior = por_numero.setdefault(convenio.NR_CONVENIO, convenio.ID_PROPOSTA)
        if proposta_anterior != convenio.ID_PROPOSTA:
            raise ValueError("Convênio SICONV vinculado a múltiplas propostas: cruzamento ambíguo.")
    catalogados = {equipamento.codigo for equipamento in CATALOGO_EQUIPAMENTOS}
    descricoes: dict[tuple[str, str], str] = {}
    evidencias: dict[str, list[EvidenciaLegado]] = {}
    for registro in itens:
        item = ItemDump.model_validate(registro)
        numero = por_proposta.get(item.ID_PROPOSTA)
        if numero is None or numero in conhecidos:
            continue
        chave = (item.ID_PROPOSTA, item.ID_ITEM_PAD)
        if chave in descricoes:
            if descricoes[chave] != item.DESCRICAO_ITEM:
                raise ValueError("Item SICONV duplicado com descrições divergentes.")
            continue
        descricoes[chave] = item.DESCRICAO_ITEM
        for evidencia in classificar_descricoes([item.DESCRICAO_ITEM]):
            # O classificador também identifica itens genéricos; descoberta
            # nacional permanece limitada ao catálogo curado do projeto.
            if evidencia.codigo in catalogados:
                evidencias.setdefault(item.ID_PROPOSTA, []).append(
                    EvidenciaLegado(
                        id_item=item.ID_ITEM_PAD,
                        codigo_equipamento=evidencia.codigo,
                        descricao=evidencia.descricao_original,
                        relacao=evidencia.relacao,
                    )
                )
    return [
        CandidatoLegado(
            numero=por_proposta[proposta],
            id_proposta=proposta,
            evidencias=tuple(sorted(evidencias[proposta], key=lambda e: (e.id_item, e.codigo_equipamento))),
        )
        for proposta in sorted(evidencias, key=lambda p: por_proposta[p])
    ]


class PublicacaoPortal(BaseModel):
    dimConvenio: DimConvenioPortal
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
