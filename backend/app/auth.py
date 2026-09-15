"""Autenticacao e autorizacao do backend."""
from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.db.models import User, UserRole, UserStatus

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 8 * 60
PBKDF2_ITERATIONS = 260_000

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algoritmo, iteracoes_raw, salt_hex, digest_hex = password_hash.split("$", 3)
        if algoritmo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iteracoes_raw),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def create_access_token(user: User) -> str:
    if not settings.jwt_secret:
        raise HTTPException(status_code=503, detail="JWT_SECRET nao configurado.")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def require_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Token de acesso obrigatorio.")
    if not settings.jwt_secret:
        raise HTTPException(status_code=503, detail="JWT_SECRET nao configurado.")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token de acesso invalido.")

    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if user is None or user.status != UserStatus.active or user.deleted_at is not None:
        raise HTTPException(status_code=403, detail="Usuario inexistente ou inativo.")
    return user


def require_monitoramento_editor(user: User = Depends(require_current_user)) -> User:
    if user.role == UserRole.leitor:
        raise HTTPException(status_code=403, detail="Perfil leitor nao pode alterar monitoramento.")
    return user
