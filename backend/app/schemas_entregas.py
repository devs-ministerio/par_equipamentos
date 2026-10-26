"""Contratos HTTP de itens, entregas e unidades de equipamento (etapa 4 do plano de monitoramento por item)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SituacaoItem = Literal["pendente", "parcial", "entregue", "legado_a_revisar"]


class UnidadeEntregaCreate(BaseModel):
    """Uma unidade física entregue: cada uma é lançada com seus próprios dados."""

    marca: str | None = Field(default=None, max_length=120)
    modelo: str | None = Field(default=None, max_length=120)
    numero_serie: str | None = Field(default=None, max_length=120)
    vida_util_anos: int | None = Field(default=None, ge=0, le=100)


class ItemEntregaCreate(BaseModel):
    item_id: int
    unidades: list[UnidadeEntregaCreate] = Field(min_length=1, max_length=500)
    confirmar_quantidade_desconhecida: bool = False


class EntregaCreate(BaseModel):
    chave_idempotencia: str = Field(min_length=8, max_length=64)
    data_ocorrencia: date
    observacao: str | None = Field(default=None, max_length=1000)
    itens: list[ItemEntregaCreate] = Field(min_length=1, max_length=50)


class VincularLegadaCreate(BaseModel):
    itens: list[ItemEntregaCreate] = Field(min_length=1, max_length=50)


class ExclusaoEntrega(BaseModel):
    motivo: str = Field(min_length=3, max_length=500)


class UnidadeUpdate(BaseModel):
    marca: str | None = Field(default=None, max_length=120)
    modelo: str | None = Field(default=None, max_length=120)
    numero_serie: str | None = Field(default=None, max_length=120)
    vida_util_anos: int | None = Field(default=None, ge=0, le=100)


class UnidadeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entrega_id: int
    item_id: int
    ordem: int
    marca: str | None
    modelo: str | None
    numero_serie: str | None
    vida_util_anos: int | None
    data_entrega: date


class RendimentoRead(BaseModel):
    """Rendimento da aplicação ligado ao item principal: não soma unidade."""

    id: int
    descricao: str
    valor_total: float | None


class ItemEquipamentoRead(BaseModel):
    id: int
    codigo_item: str | None
    nome: str
    descricao: str
    familia: str | None
    controla_unidade: bool
    quantidade_planejada: int | None
    quantidade_entregue: int
    situacao: SituacaoItem
    ultima_entrega: date | None
    unidades: list[UnidadeRead]
    rendimentos: list[RendimentoRead] = []


class EquipamentosInstrumentoRead(BaseModel):
    nr_convenio: str
    pode_editar: bool
    itens: list[ItemEquipamentoRead]
    outros_itens: int
    revisoes_pendentes: int


class EntregaRead(BaseModel):
    id: int
    instrumento_id: int
    evento_id: int | None
    data_ocorrencia: date
    observacao: str | None
    unidades: list[UnidadeRead]


class EntregaLegadaRead(BaseModel):
    id: int
    nr_convenio: str
    evento_id: int
    data_ocorrencia: date | None
    motivo: str
    criado_em: datetime
