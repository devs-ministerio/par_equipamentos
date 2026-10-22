"""Sinalização técnica de consulta de exportação maior que o teto de leitura."""

from collections.abc import Callable
from typing import TypeVar

from sqlalchemy import Select
from sqlalchemy.orm import Session

T = TypeVar("T")


class LimiteConsultaExcedido(Exception):
    """A consulta não pode ser apresentada como completa; o service decide a resposta."""


def listar_sem_truncar(
    db: Session,
    consulta: Select[tuple[T]],
    *,
    limite: int,
    corresponde: Callable[[T], bool] | None = None,
) -> list[T]:
    """Lê em lotes, contando o recorte final; excesso nunca vira lista parcial."""
    if corresponde is None:
        consulta = consulta.limit(limite + 1)
    registros = db.scalars(consulta.execution_options(yield_per=500))
    resultado: list[T] = []
    try:
        for registro in registros:
            if corresponde is not None and not corresponde(registro):
                continue
            resultado.append(registro)
            if len(resultado) > limite:
                raise LimiteConsultaExcedido
    finally:
        registros.close()
    return resultado
