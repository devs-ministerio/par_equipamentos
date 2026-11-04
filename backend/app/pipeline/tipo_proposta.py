"""Tipo de contratação de uma proposta do TransfereGov, resolvido no backend (D03).

Regra documentada da carga, sem interpretar JSON cru no frontend:
- programa oficial "Pronon ..." -> PRONON;
- demais -> FAF: as propostas do TransfereGov novo são Fundo a Fundo (confirmado com o usuário em 04/11/2026).
"""

from __future__ import annotations

from app.pipeline.texto import normalizar_texto

TIPO_FAF = "FAF"
TIPO_PRONON = "PRONON"


def tipo_da_proposta(nm_programa: str | None) -> str:
    if normalizar_texto(nm_programa).startswith("PRONON"):
        return TIPO_PRONON
    return TIPO_FAF
