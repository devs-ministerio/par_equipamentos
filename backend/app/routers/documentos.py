"""Documentos do instrumento. Leitura exige login; escrita exige editor e titularidade (no Service)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_current_user, require_monitoramento_editor
from app.db.base import get_db
from app.db.models import User
from app.schemas_documentos import DocumentoCreate, DocumentoExclusao, DocumentoRead, DocumentosInstrumentoRead
from app.services import documentos_instrumento as servico

router = APIRouter(prefix="/monitoramento", tags=["documentos"])


@router.get("/instrumentos/{nr_convenio}/documentos", response_model=DocumentosInstrumentoRead)
def listar_documentos(nr_convenio: str, db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    return servico.listar_documentos(nr_convenio=nr_convenio, db=db, usuario=usuario)


@router.post("/instrumentos/{nr_convenio}/documentos", response_model=DocumentoRead, status_code=201)
def registrar_documento(
    nr_convenio: str,
    corpo: DocumentoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.registrar_documento(nr_convenio=nr_convenio, dados=corpo, db=db, usuario=usuario)


@router.put("/documentos/{documento_id}", response_model=DocumentoRead)
def corrigir_documento(
    documento_id: int,
    corpo: DocumentoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.corrigir_documento(documento_id=documento_id, dados=corpo, db=db, usuario=usuario)


@router.delete("/documentos/{documento_id}", response_model=DocumentoRead)
def excluir_documento(
    documento_id: int,
    corpo: DocumentoExclusao,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.excluir_documento(documento_id=documento_id, dados=corpo, db=db, usuario=usuario)
