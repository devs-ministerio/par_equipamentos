"""Schemas da conclusão do acompanhamento."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

ResultadoConclusao = Literal["integral", "parcial", "sem_entregas"]


class ImpedimentoRead(BaseModel):
    tipo: Literal["item_pendente", "sem_item_controlado", "item_em_revisao", "acao_aberta"]
    descricao: str


class ConclusaoRead(BaseModel):
    id: int
    resultado: ResultadoConclusao
    # Nula só na conclusão antiga (evento `fase_concluido`) lançada sem data.
    data_conclusao: date | None
    justificativa: str | None
    data_inauguracao: date | None


SituacaoInauguracao = Literal["dispensada", "realizada", "prevista", "sem_resposta"]


class InauguracaoConclusaoRead(BaseModel):
    """Situação da inauguração no cronograma: a data só pode ser informada ao concluir quando ainda não aconteceu."""

    situacao: SituacaoInauguracao
    data_realizada: date | None = None
    data_prevista: date | None = None


class AvaliacaoConclusaoRead(BaseModel):
    nr_convenio: str
    pode_editar: bool
    conclusao: ConclusaoRead | None
    resultado: ResultadoConclusao
    exige_justificativa: bool
    itens_exigidos: int
    itens_completos: int
    impedimentos: list[ImpedimentoRead]
    inauguracao: InauguracaoConclusaoRead


class ConclusaoCreate(BaseModel):
    resultado_confirmado: ResultadoConclusao
    data_conclusao: date
    justificativa: str | None = Field(default=None, max_length=1000)
    data_inauguracao: date | None = None


class ReaberturaCreate(BaseModel):
    motivo: str = Field(min_length=5, max_length=1000)
