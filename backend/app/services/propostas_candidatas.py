"""Leitura das propostas candidatas: junta nome do CNES e marcadores de equipamento.

Função solta com `db` keyword-only; sem escrita, então nunca commita.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import PropostaCandidata
from app.repositories.cnes_estabelecimento import nomes_por_cnes
from app.repositories.equipamento_marcadores import listar_por_origens
from app.repositories.propostas_candidatas import FiltrosPropostaCandidata, listar_propostas_paginadas
from app.schemas_equipamentos import serializar_marcadores
from app.schemas_propostas_candidatas import PropostaCandidataListaRead, PropostaCandidataRead


def _com_nome_cnes(db: Session, propostas: list[PropostaCandidata]) -> list[PropostaCandidataRead]:
    nomes = nomes_por_cnes(db, {p.cnes for p in propostas if p.cnes})
    marcadores = listar_por_origens(db, proposta_ids={p.id for p in propostas})
    return [
        PropostaCandidataRead.model_validate(p).model_copy(
            update={
                "cnes_nome_estabelecimento": nomes.get(p.cnes or ""),
                "equipamentos": serializar_marcadores(marcadores.get(("proposta_candidata", p.id), [])),
            }
        )
        for p in propostas
    ]


def listar_propostas_candidatas(
    *, db: Session, filtros: FiltrosPropostaCandidata, pagina: int, tamanho_pagina: int
) -> PropostaCandidataListaRead:
    total, itens = listar_propostas_paginadas(db, filtros=filtros, pagina=pagina, tamanho_pagina=tamanho_pagina)
    return PropostaCandidataListaRead(total=total, itens=_com_nome_cnes(db, itens))
