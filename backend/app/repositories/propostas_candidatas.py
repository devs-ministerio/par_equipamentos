"""Acesso a dados de PropostaCandidata."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import String, cast, extract, func, select
from sqlalchemy.orm import Session

from app.db.models import PropostaCandidata


@dataclass(frozen=True)
class FiltrosPropostaCandidata:
    uf: str | None = None
    busca: str | None = None
    ano: int | None = None
    id_programa: int | None = None


def aplicar_filtros_proposta(query, filtros: FiltrosPropostaCandidata):
    if filtros.uf:
        query = query.where(PropostaCandidata.uf == filtros.uf)
    if filtros.id_programa is not None:
        query = query.where(PropostaCandidata.id_programa == filtros.id_programa)
    if filtros.ano is not None:
        query = query.where(extract("year", PropostaCandidata.data_proposta) == filtros.ano)
    if filtros.busca:
        alvo = f"%{filtros.busca}%"
        query = query.where(
            PropostaCandidata.nm_proponente.ilike(alvo)
            | PropostaCandidata.cnpj_ente_recebedor.ilike(alvo)
            | PropostaCandidata.municipio.ilike(alvo)
            | PropostaCandidata.nm_programa.ilike(alvo)
            | cast(PropostaCandidata.id_proposta, String).ilike(alvo)
        )
    return query


def listar_propostas_paginadas(
    db: Session,
    *,
    filtros: FiltrosPropostaCandidata,
    pagina: int,
    tamanho_pagina: int,
) -> tuple[int, list[PropostaCandidata]]:
    total = db.execute(
        aplicar_filtros_proposta(select(func.count()).select_from(PropostaCandidata), filtros)
    ).scalar_one()
    itens = (
        db.execute(
            aplicar_filtros_proposta(select(PropostaCandidata), filtros)
            .order_by(PropostaCandidata.created_at.desc())
            .offset((pagina - 1) * tamanho_pagina)
            .limit(tamanho_pagina)
        )
        .scalars()
        .all()
    )
    return total, list(itens)
