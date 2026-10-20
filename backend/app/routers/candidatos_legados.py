"""Consulta autenticada do Radar legado; nenhuma inclusão automática."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas_aprovacao_legado import AprovacaoLegadoCreate, AprovacaoLegadoRead, ProvaLegadoRead
from app.schemas_legado import (
    CandidatosLegadosRead,
    ConfirmacaoPortal,
    DecisaoLegadoCreate,
    DecisaoLegadoRead,
    HistoricoLegadoRead,
    SituacaoLegado,
)
from app.services.aprovacao_legado import aprovar_entrada
from app.services.candidatos_legados import listar_candidatos
from app.services.consulta_prova_legado import consultar_prova
from app.services.decisoes_legado import consultar_historico, registrar_decisao

router = APIRouter(prefix="/candidatos-legados", tags=["candidatos-legados"])


@router.get("/{candidato_id}/prova", response_model=ProvaLegadoRead)
def prova(
    candidato_id: Annotated[int, Path(gt=0)],
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    return consultar_prova(db=db, usuario_id=usuario.id, candidato_id=candidato_id)


@router.post("/{candidato_id}/aprovacoes", response_model=AprovacaoLegadoRead)
def aprovar(
    candidato_id: Annotated[int, Path(gt=0)],
    dados: AprovacaoLegadoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    return aprovar_entrada(db=db, usuario_id=usuario.id, candidato_id=candidato_id, dados=dados)


@router.get("", response_model=CandidatosLegadosRead)
def listar(
    pagina: Annotated[int, Query(ge=1)] = 1,
    tamanho_pagina: Annotated[int, Query(ge=1, le=50)] = 10,
    busca: Annotated[str | None, Query(max_length=100)] = None,
    confirmacao: ConfirmacaoPortal | None = None,
    situacao: SituacaoLegado | None = None,
    db: Session = Depends(get_db),
    _usuario: User = Depends(require_current_user),
):
    return listar_candidatos(
        db=db,
        pagina=pagina,
        tamanho=tamanho_pagina,
        busca=busca,
        confirmacao=confirmacao,
        situacao=situacao,
        somente_oficiais=True,
    )


@router.post("/{candidato_id}/decisoes", response_model=DecisaoLegadoRead)
def decidir(
    candidato_id: Annotated[int, Path(gt=0)],
    dados: DecisaoLegadoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    return registrar_decisao(db=db, usuario=usuario, candidato_id=candidato_id, dados=dados)


@router.get("/{candidato_id}/historico", response_model=HistoricoLegadoRead)
def historico(
    candidato_id: Annotated[int, Path(gt=0)],
    pagina: Annotated[int, Query(ge=1)] = 1,
    tamanho_pagina: Annotated[int, Query(ge=1, le=50)] = 10,
    db: Session = Depends(get_db),
    _usuario: User = Depends(require_current_user),
):
    return consultar_historico(db=db, candidato_id=candidato_id, pagina=pagina, tamanho=tamanho_pagina)
