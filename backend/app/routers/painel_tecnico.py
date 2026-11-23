"""Painel individual do técnico: cada colaborador vê o próprio; gestor e admin veem todos, com filtro (no Service)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas_painel_tecnico import PainelCarteiraLinhaRead, PainelTecnicoRead, PainelTecnicoResumoRead
from app.services import painel_tecnico as servico

router = APIRouter(prefix="/monitoramento/painel-tecnico", tags=["painel-tecnico"])


@router.get("", response_model=PainelTecnicoRead)
def obter_painel(
    usuario_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    return servico.obter_painel(db=db, usuario=usuario, usuario_id=usuario_id)


@router.get("/tecnicos", response_model=list[PainelTecnicoResumoRead])
def listar_tecnicos(db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    return servico.listar_tecnicos(db=db, usuario=usuario)


@router.get("/carteira", response_model=list[PainelCarteiraLinhaRead])
def obter_carteira(
    usuario_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    return servico.obter_carteira(db=db, usuario=usuario, usuario_id=usuario_id)
