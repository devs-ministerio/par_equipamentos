"""Consulta autenticada do Radar legado; nenhuma inclusão automática."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas_legado import CandidatosLegadosRead, ConfirmacaoPortal
from app.services.candidatos_legados import listar_candidatos

router = APIRouter(prefix="/candidatos-legados", tags=["candidatos-legados"])


@router.get("", response_model=CandidatosLegadosRead)
def listar(
    pagina: Annotated[int, Query(ge=1)] = 1,
    tamanho_pagina: Annotated[int, Query(ge=1, le=50)] = 10,
    busca: Annotated[str | None, Query(max_length=100)] = None,
    confirmacao: ConfirmacaoPortal | None = None,
    db: Session = Depends(get_db),
    _usuario: User = Depends(require_current_user),
):
    return listar_candidatos(db=db, pagina=pagina, tamanho=tamanho_pagina, busca=busca, confirmacao=confirmacao)
