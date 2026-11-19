"""Regras fixas da licença de operação da ANSN: área de atuação exigida por família de equipamento."""

from __future__ import annotations

AREA_RADIOTERAPIA = "RADIOTERAPIA"
AREA_MEDICINA_NUCLEAR = "MEDICINA NUCLEAR"

# Só as famílias com `equipamento_catalogo.exige_licenca`.
AREA_POR_FAMILIA = {
    "acelerador_linear": AREA_RADIOTERAPIA,
    "braquiterapia": AREA_RADIOTERAPIA,
    "cobalto": AREA_RADIOTERAPIA,
    "radioterapia": AREA_RADIOTERAPIA,
    "pet_ct": AREA_MEDICINA_NUCLEAR,
    "gama_camera_spect": AREA_MEDICINA_NUCLEAR,
}
