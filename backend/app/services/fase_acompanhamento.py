"""Fase do acompanhamento calculada por fatos, nunca escolhida de uma lista.

Função pura: recebe os fatos já lidos do banco e devolve a fase. Atualização externa não regride
a fase porque cada fato só se acumula (repasse, entrega, pós-entrega, conclusão).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class FaseAcompanhamento(str, Enum):
    acompanhamento_iniciado = "Acompanhamento iniciado"
    aguardando_repasse = "Aguardando repasse"
    valor_repassado = "Valor repassado"
    em_aquisicao = "Em aquisição"
    equipamento_entregue = "Equipamento entregue"
    pos_entrega = "Pós-entrega"
    concluido = "Concluído"


@dataclass(frozen=True)
class FatosAcompanhamento:
    """`repasse_previsto`: há repasse a receber (SICONV com valor de repasse, ou confirmado à mão).
    `repasse_tipo`: tipo do repasse confirmado ("integral" ou "parcial"), ou None.
    `aquisicao_iniciada`: licitação, contrato ou execução já registrados.
    """

    repasse_previsto: bool = False
    repasse_tipo: str | None = None
    aquisicao_iniciada: bool = False
    entrega_lancada: bool = False
    pos_entrega_iniciada: bool = False
    concluido: bool = False


def calcular_fase_acompanhamento(fatos: FatosAcompanhamento) -> FaseAcompanhamento:
    """O fato mais avançado decide. Repasse não bloqueia entrega: entrega sem repasse vai a entregue."""
    if fatos.concluido:
        return FaseAcompanhamento.concluido
    if fatos.entrega_lancada and fatos.pos_entrega_iniciada:
        return FaseAcompanhamento.pos_entrega
    if fatos.entrega_lancada:
        return FaseAcompanhamento.equipamento_entregue
    if fatos.repasse_tipo is not None and fatos.aquisicao_iniciada:
        return FaseAcompanhamento.em_aquisicao
    if fatos.repasse_tipo is not None:
        return FaseAcompanhamento.valor_repassado
    if fatos.repasse_previsto:
        return FaseAcompanhamento.aguardando_repasse
    return FaseAcompanhamento.acompanhamento_iniciado
