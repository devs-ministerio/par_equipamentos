"""Calculo de cobertura por macrorregiao -- extraido de
scripts/run_pipeline_tomografo.py pra ser testavel sem precisar de banco
nem das 3 APIs externas (DEMAS/SIDRA/ElastiCNES). O script de pipeline
so faz I/O (busca nas fontes, agrega, grava); a conta de negocio mora
aqui.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.db.models import DeficitStatus


@dataclass(frozen=True)
class CoberturaMacro:
    required_qty: int
    estimated_need: float
    available_qty: int
    balance: int
    deficit_status: DeficitStatus


def calcular_cobertura(*, population: int, existing_sus: int, produtividade: int = 100_000) -> CoberturaMacro:
    """RN da Metodologia: 1 equipamento por `produtividade` habitantes
    (100 mil, pra TOMOGRAFO). `existing_sus` e o denominador de oferta
    confirmado em D-02 (qt_existente_sus, nao qt_existente total -- o total
    entra so no card informativo "Total de Tomógrafos", nao no calculo).

    Macro sem populacao (RN-05: toda macro aparece, mesmo sem match no
    SIDRA) tem demanda zero e nunca fica em deficit por falta de dado --
    so classificamos deficit quando ha demanda real e a oferta nao cobre.
    """
    required_qty = math.ceil(population / produtividade) if population else 0
    balance = existing_sus - required_qty
    return CoberturaMacro(
        required_qty=required_qty,
        estimated_need=population / produtividade if population else 0,
        available_qty=existing_sus,
        balance=balance,
        deficit_status=DeficitStatus.not_deficient if balance >= 0 else DeficitStatus.deficient,
    )
