"""Notificacoes do Radar de Convenios -- 2 camadas + candidato pendente (ver
app/db/models.py::Notificacao e docs/arquitetura/fluxo_requisicao.md).
Quem CRIA notificacao sao os jobs de descoberta/verificacao (ainda a
implementar) e o PATCH de instrumento (via log_action, camada
"edicao_manual") -- este router so LE e marca como lida.

`nivel_minimo` existe no modelo mas a hierarquia de usuario ainda nao foi
definida (pedido do usuario 2026-09-15: "isso sera mostrado apenas para os
niveis de usuario acima de tecnico... ainda vamos definir") -- por isso
`listar_notificacoes` NAO filtra por role ainda, so devolve tudo. Filtrar
fica pra quando a hierarquia fechar, sem travar o resto do fluxo nessa
decisao pendente.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import Notificacao, NotificacaoTipo, User

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])


class NotificacaoRead(BaseModel):
    id: int
    tipo: NotificacaoTipo
    titulo: str
    corpo: str | None
    entidade_id: int
    nivel_minimo: str | None
    lida: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificacoesListRead(BaseModel):
    itens: list[NotificacaoRead]
    total: int
    nao_lidas: int


@router.get("", response_model=NotificacoesListRead)
def listar_notificacoes(
    limit: int = 20,
    offset: int = 0,
    apenas_nao_lidas: bool = False,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    """Contagem de nao lidas SEMPRE sobre o total (ignora `apenas_nao_lidas`/
    paginacao) -- e o numero que alimenta o badge do menu, precisa ser
    estavel independente do filtro da lista que o usuario esta vendo."""
    base = select(Notificacao)
    if apenas_nao_lidas:
        base = base.where(Notificacao.lida.is_(False))

    itens = db.execute(
        base.order_by(Notificacao.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all()
    total = db.execute(select(func.count()).select_from(Notificacao)).scalar_one()
    nao_lidas = db.execute(
        select(func.count()).select_from(Notificacao).where(Notificacao.lida.is_(False))
    ).scalar_one()

    return NotificacoesListRead(itens=itens, total=total, nao_lidas=nao_lidas)


@router.patch("/{notificacao_id}", response_model=NotificacaoRead)
def marcar_lida(
    notificacao_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    notificacao = db.execute(
        select(Notificacao).where(Notificacao.id == notificacao_id)
    ).scalar_one_or_none()
    if notificacao is None:
        raise HTTPException(404, f"Notificação {notificacao_id} não encontrada.")
    notificacao.lida = True
    db.commit()
    db.refresh(notificacao)
    return notificacao
