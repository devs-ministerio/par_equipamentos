"""Acesso a dados de User -- Modulo de gestao de usuarios (Admin), 2026-09-17."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, User, UserRole, UserStatus


@dataclass(frozen=True)
class PaginaUsuarios:
    itens: list[User]
    total: int


def listar_usuarios_paginados(
    db: Session,
    *,
    limit: int,
    offset: int,
    busca: str | None,
    role: UserRole | None,
    status: UserStatus | None,
) -> PaginaUsuarios:
    """Soft-deleted (`deleted_at` preenchido) nunca aparece na listagem
    padrao -- mesmo principio de `InstrumentoEquipamento`."""
    base = select(User).where(User.deleted_at.is_(None))
    if busca:
        termo = f"%{busca.strip()}%"
        base = base.where((User.name.ilike(termo)) | (User.email.ilike(termo)))
    if role is not None:
        base = base.where(User.role == role)
    if status is not None:
        base = base.where(User.status == status)

    itens = db.execute(base.order_by(User.name.asc()).limit(limit).offset(offset)).scalars().all()
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()

    return PaginaUsuarios(itens=list(itens), total=total)


def obter_usuario_por_id(db: Session, user_id: int) -> User | None:
    return db.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None))).scalar_one_or_none()


def obter_ultimos_logins(db: Session, usuario_ids: set[int]) -> dict[int, datetime]:
    """Somente logins bem-sucedidos; leitura em lote limitada à página atual."""
    if not usuario_ids:
        return {}
    linhas = db.execute(
        select(AuditLog.user_id, func.max(AuditLog.created_at).label("ultimo_login_em"))
        .where(AuditLog.user_id.in_(usuario_ids), AuditLog.entity_name == "auth", AuditLog.action == "login_sucesso")
        .group_by(AuditLog.user_id)
    ).all()
    return {linha.user_id: linha.ultimo_login_em for linha in linhas}


def obter_usuario_por_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email.lower().strip())).scalar_one_or_none()
