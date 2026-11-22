"""Frescor e histórico de captura das fontes oficiais (somente leitura)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas_fontes import FonteResumoRead, FonteSituacaoRead
from app.services.capturas_fonte import situacoes_das_fontes_para

router = APIRouter(prefix="/fontes", tags=["fontes"])


@router.get("/capturas", response_model=list[FonteSituacaoRead | FonteResumoRead])
def listar_situacao_das_fontes(db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    return situacoes_das_fontes_para(db, usuario)
