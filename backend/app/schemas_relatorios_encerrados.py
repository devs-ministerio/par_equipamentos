"""Contrato comum da prévia e da extração única de encerrados."""

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RegistroEncerrado(BaseModel):
    model_config = ConfigDict(frozen=True)

    chave: str
    numero: str
    nome: str
    tipo: str
    uf: str | None
    municipio: str | None
    cnes: str | None
    valor_global: Decimal | None
    motivo: str
    evidencia: str
    data_conclusao: date | None = None
    situacao_carteira: str | None = None
    situacao_monitoramento: str | None = None
    situacao_oficial: str | None = None
    pendencia: bool = False


class PreviaEncerrados(BaseModel):
    total: int
    total_pendencias: int
    pagina: int
    pagina_pendencias: int = 1
    limite: int
    itens: list[RegistroEncerrado]
    pendencias: list[RegistroEncerrado]


class OrdemEncerramento(BaseModel):
    id_ordem_pagamento: int | str | None = None
    in_situacao_op: str | None = None


class FiltroEncerramento(BaseModel):
    """Filtros combináveis; nenhuma chamada externa acontece na geração."""

    model_config = ConfigDict(frozen=True)
    uf: list[str] | None = None
    municipio: str | None = None
    cnes: str | None = None
    ano_inicio: int | None = None
    ano_fim: int | None = None
    situacao: str | None = None
    programa: str | None = None
    tipo_contratacao: str | None = None
    equipamento: str | None = None
    busca: str | None = None


class FatoEncerramento(BaseModel):
    model_config = ConfigDict(frozen=True)

    origem: Literal["instrumento", "parceria"]
    numero: str
    nome: str
    tipo: str
    uf: str | None = None
    municipio: str | None = None
    cnes: str | None = None
    ano: int | None = None
    programa: str | None = None
    valor_global: Decimal | None = None
    situacao_carteira: str | None = None
    situacao_monitoramento: str | None = None
    situacao_oficial: str | None = None
    conclusao_ativa: bool = False
    data_conclusao: date | None = None
    proposta_id: int | None = None
    parceria_confirmada: bool = False
    codigo_confirmado: str | None = None
    ordens: list[OrdemEncerramento] = Field(default_factory=list)
    evidencia_invalida: bool = False
