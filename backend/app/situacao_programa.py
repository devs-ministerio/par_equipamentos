"""Vocabulário único da situação do programa (PERSUS I): inaugurado vira "Em operação"."""

from __future__ import annotations

EM_OPERACAO = "Em operação"
EM_EXECUCAO = "Em execução"

_MAPA = {
    "INAUGURADA": EM_OPERACAO,
    "INAUGURADO": EM_OPERACAO,
    "EM OPERAÇÃO": EM_OPERACAO,
    "NÃO INAUGURADA": EM_EXECUCAO,
    "NÃO INAUGURADO": EM_EXECUCAO,
}

# Valores brutos que a migration `b4c5d6e7f8a9` converte (maiúsculas/minúsculas variam por origem).
VALORES_BRUTOS_EM_OPERACAO = ("Inaugurada", "INAUGURADA", "Inaugurado", "INAUGURADO")
VALORES_BRUTOS_EM_EXECUCAO = ("NÃO INAUGURADA", "NÃO INAUGURADO", "Não inaugurada", "Não inaugurado")


def normalizar_situacao_programa(situacao: str | None) -> str | None:
    """Troca as variantes de "inaugurado" por "Em operação"; os demais valores ficam como vieram."""
    if not situacao:
        return situacao
    return _MAPA.get(situacao.strip().upper(), situacao)
