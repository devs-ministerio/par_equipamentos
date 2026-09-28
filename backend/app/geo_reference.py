"""Referencia geografica fixa (as 27 UFs e suas grandes regioes).

Nao e dado de negocio -- nao muda, nao vem do banco. Espelha
`frontend/src/data/geo-reference.ts::UF_INFO` (fonte historica dessa
mesma referencia, so com nome/regiao, sem estado). Vira fonte oficial pro
backend com o Plan Mode de relatorios (docs/arquitetura/
planmode-relatorios-2026-09-25.md, Bloco 1): nenhuma tabela do SIGEO
persiste "grande regiao" de forma confiavel entre os dominios (Convenio,
InstrumentoEquipamento, equipment_offer_row) -- por isso a regiao e sempre
derivada da UF por este mapa, nunca lida de uma coluna.
"""

from __future__ import annotations

from sqlalchemy import case
from sqlalchemy.sql.elements import Case

REGIAO_POR_UF: dict[str, str] = {
    "AC": "Norte",
    "AL": "Nordeste",
    "AP": "Norte",
    "AM": "Norte",
    "BA": "Nordeste",
    "CE": "Nordeste",
    "DF": "Centro-Oeste",
    "ES": "Sudeste",
    "GO": "Centro-Oeste",
    "MA": "Nordeste",
    "MT": "Centro-Oeste",
    "MS": "Centro-Oeste",
    "MG": "Sudeste",
    "PA": "Norte",
    "PB": "Nordeste",
    "PR": "Sul",
    "PE": "Nordeste",
    "PI": "Nordeste",
    "RJ": "Sudeste",
    "RN": "Nordeste",
    "RS": "Sul",
    "RO": "Norte",
    "RR": "Norte",
    "SC": "Sul",
    "SP": "Sudeste",
    "SE": "Nordeste",
    "TO": "Norte",
}

REGIOES = sorted(set(REGIAO_POR_UF.values()))

UFS_POR_REGIAO: dict[str, list[str]] = {
    regiao: sorted(uf for uf, r in REGIAO_POR_UF.items() if r == regiao) for regiao in REGIOES
}


def ufs_da_regiao(regiao: str) -> list[str]:
    """UFs pertencentes a uma grande regiao; lista vazia se a regiao nao existir."""
    return UFS_POR_REGIAO.get(regiao, [])


def regiao_da_uf(uf: str) -> str | None:
    return REGIAO_POR_UF.get(uf.upper())


def expressao_regiao_por_uf(coluna_uf) -> Case:
    """Expressao SQL (CASE) que traduz uma coluna de UF para a grande regiao.

    Usada nas queries de relatorio para filtrar/agrupar por regiao sem
    depender de uma coluna persistida em nenhuma tabela.
    """
    return case(REGIAO_POR_UF, value=coluna_uf, else_=None)
