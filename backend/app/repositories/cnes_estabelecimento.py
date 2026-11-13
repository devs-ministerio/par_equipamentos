"""Consultas de CnesEstabelecimento compartilhadas por convênios e propostas candidatas.

Função solta com `db: Session` posicional; nunca commita.
"""

from __future__ import annotations

from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CnesEstabelecimento


def nomes_por_cnes(db: Session, codigos: Collection[str]) -> dict[str, str | None]:
    """Nome do estabelecimento por código CNES, em uma consulta só."""
    if not codigos:
        return {}
    return {
        row.cnes: row.nome_estabelecimento
        for row in db.execute(select(CnesEstabelecimento).where(CnesEstabelecimento.cnes.in_(codigos))).scalars()
    }


def municipios_por_cnes(db: Session, codigos: Collection[str]) -> dict[str, str | None]:
    """Município do estabelecimento por código CNES, em uma consulta só."""
    if not codigos:
        return {}
    return {
        row.cnes: row.municipio
        for row in db.execute(select(CnesEstabelecimento).where(CnesEstabelecimento.cnes.in_(codigos))).scalars()
    }
