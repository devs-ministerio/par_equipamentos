"""Município do estabelecimento (CNES): onde o equipamento fica, não onde o convenente tem sede."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CnesEstabelecimento
from app.pipeline.texto import normalizar_texto


def cnes_do_municipio(db: Session, municipio: str, ufs: list[str] | None = None) -> set[str]:
    """CNES dos estabelecimentos do município (comparação sem acento e sem caixa, como nos demais filtros)."""
    alvo = normalizar_texto(municipio)
    consulta = select(CnesEstabelecimento.cnes, CnesEstabelecimento.municipio)
    if ufs:
        consulta = consulta.where(CnesEstabelecimento.uf.in_(ufs))
    return {cnes for cnes, nome in db.execute(consulta) if nome and normalizar_texto(nome) == alvo}
