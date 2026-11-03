"""Tipo de contratação de uma proposta do TransfereGov, resolvido no backend (D03).

Regra documentada da carga, sem interpretar JSON cru no frontend:
- programa oficial "Pronon ..." -> PRONON;
- texto oficial da proposta com a modalidade "Fundo a Fundo" (Normas de Cooperação Financeira) -> FAF;
- demais -> "Parceria TransfereGov" (padrão).
"""

from __future__ import annotations

import json

from app.pipeline.texto import normalizar_texto

TIPO_PARCERIA = "Parceria TransfereGov"
TIPO_FAF = "FAF"
TIPO_PRONON = "PRONON"

# Trecho normalizado (sem acento, maiúsculo) que o TransfereGov grava ao descrever a modalidade da proposta.
EVIDENCIA_FUNDO_A_FUNDO = "MODALIDADE FUNDO A FUNDO"
# Mesmo trecho para consulta SQL (`ILIKE`); o texto oficial não tem acento nesse trecho.
PADRAO_SQL_FUNDO_A_FUNDO = "%modalidade Fundo a Fundo%"


def evidencia_fundo_a_fundo(metas_resumo: dict | None) -> bool:
    if not metas_resumo:
        return False
    return EVIDENCIA_FUNDO_A_FUNDO in normalizar_texto(json.dumps(metas_resumo, ensure_ascii=False))


def tipo_da_proposta(nm_programa: str | None, *, fundo_a_fundo: bool) -> str:
    if normalizar_texto(nm_programa).startswith("PRONON"):
        return TIPO_PRONON
    return TIPO_FAF if fundo_a_fundo else TIPO_PARCERIA
