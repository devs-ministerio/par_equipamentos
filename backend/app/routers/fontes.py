"""Frescor e histórico de captura das fontes oficiais (somente leitura)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.services.capturas_fonte import mensagem_publica_da_captura, situacao_das_fontes

router = APIRouter(prefix="/fontes", tags=["fontes"])


class FonteSituacaoRead(BaseModel):
    fonte: str
    rotulo: str
    status: str
    ultima_tentativa_em: datetime
    ultimo_sucesso_em: datetime | None
    defasada: bool
    itens_verificados: int
    itens_alterados: int
    erro: str | None


@router.get("/capturas", response_model=list[FonteSituacaoRead])
def listar_situacao_das_fontes(db: Session = Depends(get_db), _usuario: User = Depends(require_current_user)):
    return [
        FonteSituacaoRead(
            fonte=s.fonte,
            rotulo=s.rotulo,
            status=s.ultima_tentativa.status,
            ultima_tentativa_em=s.ultima_tentativa.finalizado_em,
            ultimo_sucesso_em=s.ultimo_sucesso_em,
            defasada=s.defasada,
            itens_verificados=s.ultima_tentativa.itens_verificados,
            itens_alterados=s.ultima_tentativa.itens_alterados,
            # Capturas anteriores também podem conter exceções cruas no banco.
            erro=mensagem_publica_da_captura(s.ultima_tentativa.status),
        )
        for s in situacao_das_fontes(db)
    ]
