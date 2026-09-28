"""Trilha de auditoria (Módulo de Auditoria, 2026-09-28) -- Router fino,
mesmo padrão de `usuarios.py`/`notificacoes.py`: só monta `Depends`, chama o
Service e devolve o retorno. `require_admin_user` (não `require_current_user`)
-- a listagem cruza e-mail/IP/histórico de qualquer usuário, mesmo gate do
módulo de gestão de usuários."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_admin_user
from app.db.base import get_db
from app.db.models import User
from app.schemas_auditoria import AuditoriaItemRead, AuditoriaPaginaRead
from app.services.auditoria import listar_auditoria

router = APIRouter(prefix="/auditoria", tags=["auditoria"])


@router.get("", response_model=AuditoriaPaginaRead)
def listar(
    limit: int = Query(default=50, le=200, gt=0),
    offset: int = 0,
    entity_name: str | None = None,
    action: str | None = None,
    user_id: int | None = None,
    desde: datetime | None = None,
    ate: datetime | None = None,
    db: Session = Depends(get_db),
    admin_atual: User = Depends(require_admin_user),
):
    pagina = listar_auditoria(
        db=db,
        admin_atual=admin_atual,
        limit=limit,
        offset=offset,
        entity_name=entity_name,
        action=action,
        user_id=user_id,
        desde=desde,
        ate=ate,
    )
    itens = [AuditoriaItemRead.model_validate(item) for item in pagina.itens]
    return AuditoriaPaginaRead(itens=itens, total=pagina.total)
