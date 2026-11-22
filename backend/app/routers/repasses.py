"""Repasse do instrumento: situação e confirmação manual. O CSRF é verificado pelo middleware global."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_current_user, require_monitoramento_editor
from app.db.base import get_db
from app.db.models import User
from app.schemas_repasses import RepasseCreate, RepasseRead, SituacaoRepasseRead
from app.services import repasses as servico

router = APIRouter(prefix="/monitoramento", tags=["repasses"])


@router.get("/instrumentos/{nr_convenio}/repasse", response_model=SituacaoRepasseRead)
def obter_situacao_repasse(
    nr_convenio: str, db: Session = Depends(get_db), _usuario: User = Depends(require_current_user)
):
    return servico.obter_situacao_repasse(nr_convenio=nr_convenio, db=db)


@router.post("/instrumentos/{nr_convenio}/repasse", response_model=RepasseRead, status_code=201)
def confirmar_repasse(
    nr_convenio: str,
    corpo: RepasseCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.registrar_repasse_manual(nr_convenio=nr_convenio, dados=corpo, db=db, usuario=usuario)
