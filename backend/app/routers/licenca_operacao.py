"""Licença de operação do instrumento (fonte oficial da ANSN, por estabelecimento). Leitura exige login."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas_licenca_ansn import LicencaOperacaoRead
from app.services import licenca_operacao as servico

router = APIRouter(prefix="/monitoramento", tags=["licenca-operacao"])


@router.get("/instrumentos/{nr_convenio}/licenca-operacao", response_model=LicencaOperacaoRead)
def obter_licenca_operacao(
    nr_convenio: str, db: Session = Depends(get_db), usuario: User = Depends(require_current_user)
):
    return servico.obter_licenca_operacao(nr_convenio=nr_convenio, db=db, usuario=usuario)
