"""Comparação pura entre o último dado confirmado e uma nova captura.

Regras do espelho oficial:
- sem baseline (primeira captura) não há diferença a anunciar;
- campo ou item ausente da nova resposta nunca é tratado como remoção, só
  sinalizado como ``ausentes``; o valor anterior é preservado;
- valores são comparados como texto, como a fonte os publica.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

Registro = dict[str, Any]


def diff_campos(antigo: Registro | None, novo: Registro) -> dict[str, tuple[str, str]]:
    """Campos escalares presentes nos dois lados e com valor diferente."""
    if not antigo:
        return {}
    return {
        campo: (str(antigo[campo]), str(valor))
        for campo, valor in novo.items()
        if campo in antigo and not isinstance(valor, (dict, list)) and str(antigo[campo]) != str(valor)
    }


@dataclass(frozen=True)
class DiffLista:
    adicionados: list[Registro] = field(default_factory=list)
    alterados: list[tuple[str, dict[str, tuple[str, str]]]] = field(default_factory=list)
    ausentes: list[str] = field(default_factory=list)

    @property
    def vazio(self) -> bool:
        return not (self.adicionados or self.alterados)


def _indexar(registros: Iterable[Registro], chave: str) -> dict[str, Registro]:
    indice: dict[str, Registro] = {}
    for registro in registros:
        if registro.get(chave) in (None, ""):
            continue
        identificador = str(registro[chave])
        if identificador in indice and indice[identificador] != registro:
            raise ValueError(f"Captura contém chave {chave} duplicada com dados divergentes.")
        indice[identificador] = registro
    return indice


def diff_lista(antigo: Sequence[Registro] | None, novo: Sequence[Registro], chave: str) -> DiffLista:
    """Diferença por chave estável; ``antigo=None`` significa sem baseline."""
    if antigo is None:
        return DiffLista()
    anteriores = _indexar(antigo, chave)
    atuais = _indexar(novo, chave)
    adicionados = [registro for chave_registro, registro in atuais.items() if chave_registro not in anteriores]
    alterados = [
        (chave_registro, campos)
        for chave_registro, registro in atuais.items()
        if chave_registro in anteriores and (campos := diff_campos(anteriores[chave_registro], registro))
    ]
    ausentes = [chave_registro for chave_registro in anteriores if chave_registro not in atuais]
    return DiffLista(adicionados=adicionados, alterados=alterados, ausentes=ausentes)


def mesclar_lista(antigo: Sequence[Registro] | None, novo: Sequence[Registro], chave: str) -> list[Registro]:
    """Aplica a nova captura sem descartar o que a fonte deixou de devolver.

    Campos presentes na captura nova substituem os de mesma chave; os anteriores sem
    correspondência (inclusive sem chave, como evidências manuais) ficam.
    """
    if any(registro.get(chave) in (None, "") for registro in novo):
        raise ValueError(f"Captura contém registro sem a chave obrigatória {chave}.")
    atuais = _indexar(novo, chave)
    resultado: list[Registro] = []
    usados: set[str] = set()
    for registro in antigo or []:
        valor = registro.get(chave)
        chave_registro = str(valor) if valor not in (None, "") else None
        if chave_registro is not None and chave_registro in atuais:
            resultado.append({**registro, **atuais[chave_registro]})
            usados.add(chave_registro)
        else:
            resultado.append(registro)
    resultado.extend(registro for chave_registro, registro in atuais.items() if chave_registro not in usados)
    return resultado
