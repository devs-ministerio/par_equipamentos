"""Provisiona a conta descartável usada exclusivamente no E2E do CI.

Nunca rode sem ``E2E_ISOLATED_DATABASE=true``: a trava impede que uma
credencial de teste altere banco local ou de produção por engano. E-mail e
senha vêm apenas de secrets do ambiente; este script não os imprime.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from sqlalchemy import select

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import User, UserRole, UserStatus


def _segredo(nome: str) -> str:
    valor = os.environ.get(nome, "")
    if not valor:
        raise SystemExit(f"{nome} ausente para a suíte E2E.")
    return valor


def run() -> None:
    if os.environ.get("E2E_ISOLATED_DATABASE") != "true":
        raise SystemExit("Recusado: defina E2E_ISOLATED_DATABASE=true somente no banco efêmero do CI.")

    email = _segredo("E2E_EMAIL").strip().lower()
    senha = _segredo("E2E_SENHA")
    db = SessionLocal()
    try:
        usuario = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if usuario is None:
            usuario = User(
                name="Conta E2E descartável",
                email=email,
                password_hash=hash_password(senha),
                role=UserRole.colaborador,
                status=UserStatus.active,
                activated_at=datetime.now(timezone.utc),
            )
            db.add(usuario)
        else:
            usuario.password_hash = hash_password(senha)
            usuario.role = UserRole.colaborador
            usuario.status = UserStatus.active
            usuario.deleted_at = None
            usuario.failed_login_attempts = 0
            usuario.locked_until = None
            usuario.activation_token_hash = None
            usuario.activation_expires_at = None
            usuario.activated_at = usuario.activated_at or datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run()
