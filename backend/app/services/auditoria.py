"""Casos de uso da trilha de auditoria (Módulo de Auditoria, 2026-09-28) --
mesmo padrão Router -> Service -> Repository de `notificacoes`/`usuarios`.
Só leitura, gate admin (mesmo de `usuarios`, não o binário leitor/resto do
resto do app -- auditoria expõe e-mail/IP/histórico de todo mundo)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.authz import assert_e_admin
from app.db.models import User
from app.repositories.auditoria import PaginaAuditoria, listar_auditoria_paginada


def listar_auditoria(
    *,
    db: Session,
    admin_atual: User,
    limit: int,
    offset: int,
    entity_name: str | None,
    action: str | None,
    user_id: int | None,
    desde: datetime | None,
    ate: datetime | None,
) -> PaginaAuditoria:
    assert_e_admin(admin_atual)
    return listar_auditoria_paginada(
        db,
        limit=limit,
        offset=offset,
        entity_name=entity_name,
        action=action,
        user_id=user_id,
        desde=desde,
        ate=ate,
    )
