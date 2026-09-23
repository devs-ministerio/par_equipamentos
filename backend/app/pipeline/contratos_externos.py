"""Validação mínima e reutilizável para respostas de APIs externas.

O contrato preserva o payload bruto para os importadores legados, mas impede
que HTML, escalares ou envelopes malformados atravessem a fronteira como dado
de domínio. DTOs específicos por recurso serão introduzidos consumidor a
consumidor, sem quebrar as cargas existentes.
"""
from __future__ import annotations

from typing import Any

from pydantic import TypeAdapter, ValidationError


class RespostaExternaInvalidaError(RuntimeError):
    """Fornecedor respondeu um payload incompatível com o contrato mínimo."""


_objeto = TypeAdapter(dict[str, Any])
_lista_objetos = TypeAdapter(list[dict[str, Any]])


def validar_objeto_externo(payload: object, *, fonte: str) -> dict[str, Any]:
    try:
        return _objeto.validate_python(payload, strict=True)
    except ValidationError as exc:
        raise RespostaExternaInvalidaError(f"{fonte} devolveu objeto inválido.") from exc


def validar_lista_objetos_externos(payload: object, *, fonte: str) -> list[dict[str, Any]]:
    try:
        return _lista_objetos.validate_python(payload, strict=True)
    except ValidationError as exc:
        raise RespostaExternaInvalidaError(f"{fonte} devolveu lista inválida.") from exc
