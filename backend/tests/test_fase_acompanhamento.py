import pytest

from app.services.fase_acompanhamento import (
    FaseAcompanhamento as F,
)
from app.services.fase_acompanhamento import (
    FatosAcompanhamento,
    calcular_fase_acompanhamento,
)


@pytest.mark.parametrize(
    ("fatos", "esperada"),
    [
        (FatosAcompanhamento(), F.acompanhamento_iniciado),
        (FatosAcompanhamento(repasse_previsto=True), F.aguardando_repasse),
        (FatosAcompanhamento(repasse_previsto=True, repasse_tipo="parcial"), F.valor_repassado),
        (FatosAcompanhamento(repasse_tipo="integral", aquisicao_iniciada=True), F.em_aquisicao),
        (FatosAcompanhamento(aquisicao_iniciada=True), F.acompanhamento_iniciado),
        (FatosAcompanhamento(entrega_lancada=True), F.equipamento_entregue),
        (FatosAcompanhamento(repasse_tipo="parcial", entrega_lancada=True), F.equipamento_entregue),
        (FatosAcompanhamento(entrega_lancada=True, pos_entrega_iniciada=True), F.pos_entrega),
        (FatosAcompanhamento(pos_entrega_iniciada=True), F.acompanhamento_iniciado),
        (FatosAcompanhamento(entrega_lancada=True, pos_entrega_iniciada=True, concluido=True), F.concluido),
        (FatosAcompanhamento(concluido=True), F.concluido),
    ],
)
def test_calcular_fase_acompanhamento(fatos, esperada):
    assert calcular_fase_acompanhamento(fatos) is esperada
