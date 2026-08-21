"""Registro central de auditoria (RNF-05) -- toda rota que faz algo digno
de log chama log_action() em vez de inserir em audit_log na mao. Mantem o
formato consistente e evita repetir logica em cada endpoint.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import AuditLog


def log_action(
    db: Session,
    *,
    user_id: int | None,
    entity_name: str,
    entity_id: int | None,
    action: str,
    details: dict | None = None,
) -> None:
    """Nao commita sozinho -- fica na mesma transacao da acao que esta
    sendo registrada, pra log e acao terem tudo ou nada juntos."""
    db.add(
        AuditLog(
            user_id=user_id,
            entity_name=entity_name,
            entity_id=entity_id,
            action=action,
            details=details,
        )
    )
