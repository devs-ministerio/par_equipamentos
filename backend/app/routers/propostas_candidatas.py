"""Leitura das propostas descobertas pelo Radar de Convênios.

A inclusão no monitoramento é explícita na interface e reutiliza
``POST /monitoramento/instrumentos``. Esta rota não mantém um ciclo interno
de aceite/rejeição.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.repositories.propostas_candidatas import FiltrosPropostaCandidata
from app.schemas_propostas_candidatas import PropostaCandidataListaRead
from app.services import propostas_candidatas as servico

router = APIRouter(prefix="/propostas-candidatas", tags=["propostas-candidatas"])


@router.get("", response_model=PropostaCandidataListaRead)
def listar_propostas_candidatas(
    uf: str | None = None,
    busca: str | None = None,
    ano: int | None = None,
    id_programa: int | None = None,
    pagina: int = Query(1, ge=1),
    tamanho_pagina: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    """Leitura autenticada do radar de propostas.

    Paginação e filtros SQL simples no banco; o front ainda pode pedir
    `tamanho_pagina=500` enquanto filtros derivados de `metas_resumo`
    (equipamento / situação de fato / "novas") permanecem client-side."""
    filtros = FiltrosPropostaCandidata(uf=uf, busca=busca, ano=ano, id_programa=id_programa)
    return servico.listar_propostas_candidatas(db=db, filtros=filtros, pagina=pagina, tamanho_pagina=tamanho_pagina)
