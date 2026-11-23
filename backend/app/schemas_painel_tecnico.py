"""Contratos HTTP do painel individual do técnico (monitoramento interno)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class PainelUsuarioRead(BaseModel):
    id: int
    nome: str
    papel: str


class PainelCarteiraRegiaoRead(BaseModel):
    """Convênios do escopo na região (PERSUS II fora: ainda em contratação) frente ao que já foi cadastrado."""

    elegiveis: int
    monitorados: int
    cobertura_pct: float | None
    faltam_em_aberto: int
    faltam_concluidos: int
    valor_faltam_em_aberto: float
    valor_faltam_concluidos: float


class PainelCarteiraLinhaRead(BaseModel):
    numero: str
    uf: str | None
    municipio: str | None
    convenente: str | None
    cnes: str | None = None
    entrou_radar_em: date | None = None
    cnpj_convenente: str | None
    tipo_contratacao: str | None
    situacao: str | None
    fase: str | None = None
    valor_global: float | None
    em_aberto: bool
    monitorado: bool
    titular: str | None
    eventos: int
    acoes: int
    acoes_atrasadas: int
    lancado_recente: bool
    sem_registro: bool


class PainelContagemRead(BaseModel):
    instrumentos: int
    com_registro: int
    sem_registro: int
    concluidos: int
    com_repasse: int
    com_entrega: int


class PainelSemanaRead(BaseModel):
    semana: date
    lancamentos: int


class PainelAtividadeRead(BaseModel):
    lancamentos_total: int
    lancamentos_15d: int
    instrumentos_tocados: int
    ultimo_lancamento: datetime | None
    por_semana: list[PainelSemanaRead]


class PainelTecnicoResumoRead(BaseModel):
    """Opção do filtro por colaborador (gestão e admin)."""

    id: int
    nome: str
    ufs: list[str]
    instrumentos: int


class PainelTecnicoRead(BaseModel):
    escopo: Literal["individual", "todos"]
    usuario: PainelUsuarioRead | None
    ufs: list[str] | None
    gerado_em: datetime
    carteira: PainelCarteiraRegiaoRead
    regiao: PainelContagemRead
    regiao_sem_titular: int
    meus: PainelContagemRead
    atividade: PainelAtividadeRead
