"""Contratos HTTP da fila de revisão da classificação dos itens do plano."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TipoLancamento = Literal["aquisicao", "rendimento_aplicacao", "acessorio_insumo", "multiplo", "nao_equipamento"]


class ItemParaRevisaoRead(BaseModel):
    id: int
    convenio_numero: str
    instrumento_nr_convenio: str | None
    descricao: str
    valor_total: float | None
    tipo_lancamento: TipoLancamento
    codigo_item: str | None
    familia: str | None
    motivo: str | None


class DecisaoItemCreate(BaseModel):
    acao: Literal["confirmar", "corrigir", "nao_equipamento"]
    # Só em "corrigir": o tipo e, para aquisição, o código RENEM (6 dígitos) escolhidos pela equipe.
    tipo_lancamento: TipoLancamento | None = None
    codigo_item: str | None = Field(default=None, pattern=r"^\d{6}$")
    observacao: str | None = Field(default=None, max_length=500)
