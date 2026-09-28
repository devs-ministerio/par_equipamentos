"""Normalizacao de texto para chaves de resolucao. Portado de
src/normalize/texto.py (pipeline legado) -- sem a dependencia de pandas do
original (so precisavamos do `pd.isna`, trocado por checagem direta).
"""

from __future__ import annotations

import re
import unicodedata


def normalizar_texto(valor: str | None) -> str:
    """Canonicaliza texto para uso como chave de resolucao."""
    if valor is None:
        return ""
    texto = str(valor).strip().upper()
    # NFKD separa o caractere do diacritico; categoria Mn = marca de acentuacao
    texto = "".join(c for c in unicodedata.normalize("NFKD", texto) if unicodedata.category(c) != "Mn")
    texto = re.sub(r"[^A-Z0-9 ]", " ", texto)  # hifen, apostrofo, ponto
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto


def parsear_valor_brasileiro(valor: object) -> float | None:
    """Número em formato brasileiro -- vírgula decimal, ponto de milhar e
    prefixo "R$" opcionais (ex. "R$ 73.804,18", "5928266,99", "5430000").
    Consolidado aqui 2026-09-27 depois de achar 3 cópias quase idênticas
    (SICONV bulk usa vírgula sem milhar, `Controle PERSUS.xlsx` usa "R$"
    com milhar) -- um bug real (`float("5928266,99")` estourava
    `ValueError` sem o tratamento de vírgula, valor caía silenciosamente
    pro fallback errado) motivou a correção; a duplicação motivou juntar
    num só lugar em vez de corrigir 3 vezes."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor).replace("R$", "").strip()
    if not texto:
        return None
    texto = texto.replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        return None


def capitalizar_nome(valor: str | None) -> str | None:
    """Title Case pra nome de município -- espelho de `capitalizarNome`
    (frontend/src/utils/texto.ts). Achado ao vivo 2026-09-26: convenios
    convivem com grafia mista/toda maiúscula ("BLUMENAU", "SÃO PAULO") na
    mesma coluna a depender da origem (SICONV/manual); o relatório gerado
    (Excel/Word) mostrava essa grafia crua enquanto a prévia da UI já
    normalizava, uma inconsistência de "dado feio" só no arquivo baixado.
    Só usar em campo de LUGAR (município) -- nome de instituição tem sigla
    legítima (UFMG, HRPL) que Title Case quebraria."""
    if not valor:
        return valor
    return " ".join(p.capitalize() if p else p for p in valor.lower().split(" "))
