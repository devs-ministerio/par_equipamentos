"""Conclusão do acompanhamento. Leitura exige login; escrita exige editor e titularidade (no Service)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_current_user, require_monitoramento_editor
from app.db.base import get_db
from app.db.models import User
from app.schemas_conclusao import AvaliacaoConclusaoRead, ConclusaoCreate, ConclusaoRead, ReaberturaCreate
from app.services import conclusao_acompanhamento as servico

router = APIRouter(prefix="/monitoramento", tags=["conclusao"])


@router.get("/instrumentos/{nr_convenio}/conclusao", response_model=AvaliacaoConclusaoRead)
def avaliar_conclusao(nr_convenio: str, db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    return servico.avaliar_conclusao(nr_convenio=nr_convenio, db=db, usuario=usuario)


@router.post("/instrumentos/{nr_convenio}/conclusao", response_model=ConclusaoRead, status_code=201)
def concluir_acompanhamento(
    nr_convenio: str,
    corpo: ConclusaoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.concluir_acompanhamento(nr_convenio=nr_convenio, dados=corpo, db=db, usuario=usuario)


@router.delete("/instrumentos/{nr_convenio}/conclusao", response_model=ConclusaoRead)
def reabrir_acompanhamento(
    nr_convenio: str,
    corpo: ReaberturaCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.reabrir_acompanhamento(nr_convenio=nr_convenio, dados=corpo, db=db, usuario=usuario)
