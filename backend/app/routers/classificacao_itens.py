"""Fila de revisão da classificação dos itens do plano; leitura e decisão exigem gestor ou admin (no Service)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas_classificacao import DecisaoItemCreate, ItemParaRevisaoRead
from app.services import classificacao_itens_plano as servico

router = APIRouter(prefix="/monitoramento/classificacao", tags=["classificacao"])


@router.get("/fila", response_model=list[ItemParaRevisaoRead])
def listar_fila(db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    return servico.listar_fila(db=db, usuario=usuario)


@router.post("/itens/{item_id}", response_model=ItemParaRevisaoRead)
def decidir(
    item_id: int,
    corpo: DecisaoItemCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    return servico.decidir(item_id=item_id, dados=corpo, db=db, usuario=usuario)
