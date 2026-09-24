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
