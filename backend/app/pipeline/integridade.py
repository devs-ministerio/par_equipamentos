"""Pré-condições de completude; não substitui ausência por população zero."""

from collections.abc import Collection, Mapping


def validar_populacoes(municipios: Collection[str], populacao: Mapping[str, int], ans: Mapping[str, int]) -> None:
    if not municipios or not populacao or not ans:
        raise ValueError("População residente e referência ANS são obrigatórias; publicação cancelada.")
    sem_populacao = set(municipios) - populacao.keys()
    sem_ans = set(municipios) - ans.keys()
    if sem_populacao or sem_ans:
        raise ValueError(
            f"População incompleta: {len(sem_populacao)} municípios sem residente e {len(sem_ans)} sem ANS; "
            "publicação cancelada."
        )
    if any(populacao[codigo] <= 0 or ans[codigo] < 0 for codigo in municipios):
        raise ValueError("População residente/ANS inválida; publicação cancelada.")
