"""Calculo de cobertura por macrorregiao -- extraido de
scripts/run_pipeline_tomografo.py pra ser testavel sem precisar de banco
nem das 3 APIs externas (DEMAS/SIDRA/ElastiCNES). O script de pipeline
so faz I/O (busca nas fontes, agrega, grava); a conta de negocio mora
aqui.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TypedDict

from app.db.models import DeficitStatus

PRODUTIVIDADE_PADRAO = 100_000
PRODUTIVIDADE_POR_FAMILIA = {
    "TOMOGRAFO": 100_000,
    "RESSONANCIA": 5_000 / (30 / 1_000),
    "PET_CT": 1_500_000,
}


class OfertaAgregada(TypedDict):
    """Acumulador da oferta; não participa da fórmula de cobertura."""

    existente: int
    uso_sus: int
    estabelecimentos: set[str]


def nova_oferta_agregada() -> OfertaAgregada:
    return {"existente": 0, "uso_sus": 0, "estabelecimentos": set()}


def produtividade_por_familia(equipment_family: str | None) -> float:
    return PRODUTIVIDADE_POR_FAMILIA.get(equipment_family or "", PRODUTIVIDADE_PADRAO)


@dataclass(frozen=True)
class CoberturaMacro:
    required_qty: int
    estimated_need: float
    available_qty: int
    balance: int
    deficit_status: DeficitStatus


def populacao_sus_dependente(*, residente: int, ans: int) -> int:
    """RN: populacao SUS-dependente = IBGE residente - beneficiarios de plano
    de saude (ANS), nunca negativa. `residente` vem ao vivo do SIDRA;
    `ans` vem do arquivo de referencia importado (sem API oficial ao vivo
    conhecida) -- por serem duas fontes/vintages diferentes, um municipio
    pode ter mais beneficiarios ANS cadastrados que populacao SIDRA do ano
    corrente (defasagem entre fontes); nesse caso a leitura correta e "0
    dependentes do SUS ali", nunca um numero negativo."""
    return max(0, residente - ans)


def calcular_cobertura(
    *, population: int, in_use_sus: int, produtividade: float = PRODUTIVIDADE_PADRAO
) -> CoberturaMacro:
    """RN da Metodologia: 1 equipamento por `produtividade` habitantes
    (100 mil, pra TOMOGRAFO). `in_use_sus` e o denominador de oferta --
    qt_uso-onde-sus_flag (equipamento em uso E SUS), decisao 2026-08-24
    (antes era qt_existente_sus/D-02: equipamento existente nao entra mais
    na conta se nao estiver em uso). qt_existente total continua so no
    card informativo "Total de Equipamentos", nao no calculo.

    Macro sem populacao (RN-05: toda macro aparece, mesmo sem match no
    SIDRA) tem demanda zero e status not_available, para o front nao ler
    ausencia de dado populacional como hipersuficiencia.
    """
    required_qty = math.ceil(population / produtividade) if population else 0
    balance = in_use_sus - required_qty
    if not population:
        deficit_status = DeficitStatus.not_available
    else:
        deficit_status = DeficitStatus.not_deficient if balance >= 0 else DeficitStatus.deficient
    return CoberturaMacro(
        required_qty=required_qty,
        estimated_need=population / produtividade if population else 0,
        available_qty=in_use_sus,
        balance=balance,
        deficit_status=deficit_status,
    )
