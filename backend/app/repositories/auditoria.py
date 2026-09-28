"""Acesso a dados de `AuditLog` -- leitura (Módulo de Auditoria, 2026-09-28).
Escrita continua centralizada em `app/audit.py::log_action`, chamado de
dentro dos Services que produzem cada evento; este repositório só lê."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, User


@dataclass(frozen=True)
class AuditoriaItem:
    id: int
    created_at: datetime
    usuario_id: int | None
    usuario_nome: str | None
    usuario_email: str | None
    entity_name: str
    entity_id: int | None
    action: str
    details: dict | None


@dataclass(frozen=True)
class PaginaAuditoria:
    itens: list[AuditoriaItem]
    total: int


def listar_auditoria_paginada(
    db: Session,
    *,
    limit: int,
    offset: int,
    entity_name: str | None,
    action: str | None,
    user_id: int | None,
    desde: datetime | None,
    ate: datetime | None,
) -> PaginaAuditoria:
    """`LEFT JOIN` com `User` (não `INNER`) -- `AuditLog.user_id` é `NULL`
    pra ação de sistema (pipeline automático), que continua devendo aparecer
    na listagem com `usuario_nome=None` (a UI mostra "Sistema")."""
    base = select(AuditLog, User.name, User.email).outerjoin(User, User.id == AuditLog.user_id)
    if entity_name is not None:
        base = base.where(AuditLog.entity_name == entity_name)
    if action is not None:
        base = base.where(AuditLog.action == action)
    if user_id is not None:
        base = base.where(AuditLog.user_id == user_id)
    if desde is not None:
        base = base.where(AuditLog.created_at >= desde)
    if ate is not None:
        base = base.where(AuditLog.created_at <= ate)

    linhas = db.execute(base.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).offset(offset)).all()
    itens = [
        AuditoriaItem(
            id=log.id,
            created_at=log.created_at,
            usuario_id=log.user_id,
            usuario_nome=nome,
            usuario_email=email,
            entity_name=log.entity_name,
            entity_id=log.entity_id,
            action=log.action,
            details=log.details,
        )
        for log, nome, email in linhas
    ]

    contagem = select(func.count()).select_from(AuditLog)
    if entity_name is not None:
        contagem = contagem.where(AuditLog.entity_name == entity_name)
    if action is not None:
        contagem = contagem.where(AuditLog.action == action)
    if user_id is not None:
        contagem = contagem.where(AuditLog.user_id == user_id)
    if desde is not None:
        contagem = contagem.where(AuditLog.created_at >= desde)
    if ate is not None:
        contagem = contagem.where(AuditLog.created_at <= ate)
    total = db.execute(contagem).scalar_one()

    return PaginaAuditoria(itens=itens, total=total)
