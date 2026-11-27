"""Regra única do valor global exibido nos painéis (Painel de gestão e Carteira do Meu painel).

O valor só vale quando é finito, não negativo e a origem o sustenta: convênio com a fonte financeira confiável, ou carga manual
(FAF, TED, PERSUS I, PERSUS II, PRONON), cujo valor global é tratado como desembolso integral por decisão da equipe.
Espelha ``montarMetricasPainel`` em ``frontend/src/lib/monitoramento-painel-metricas.ts``."""

from __future__ import annotations

from decimal import Decimal
from math import isfinite

TIPOS_SEM_DADOS_OFICIAIS = frozenset({"FAF", "TED", "PERSUS I", "PERSUS II", "PRONON"})


def valor_global_considerado(
    valor: Decimal | float | None, *, tipo_contratacao: str | None, fonte_confiavel: bool
) -> float | None:
    """Devolve o valor global que os painéis podem somar e exibir, ou ``None`` quando não vale."""
    if valor is None:
        return None
    numero = float(valor)
    if not isfinite(numero) or numero < 0:
        return None
    if fonte_confiavel or tipo_contratacao in TIPOS_SEM_DADOS_OFICIAIS:
        return numero
    return None
