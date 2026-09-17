"""Autenticacao e autorizacao do backend."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.db.models import RefreshToken, User, UserRole, UserStatus

ALGORITHM = "HS256"
PBKDF2_ITERATIONS = 260_000

# Nomes dos cookies HttpOnly de sessao -- Bloco 2 do Plan Mode seguranca
# 2026-09-16. `path` do refresh fica restrito a /auth/refresh (ver
# `set_session_cookies`/`clear_session_cookies` em routers/auth.py) pra
# reduzir a superficie de exposicao do cookie de vida mais longa.
ACCESS_COOKIE_NAME = "sigeo_access"
REFRESH_COOKIE_NAME = "sigeo_refresh"
REFRESH_COOKIE_PATH = "/auth/refresh"

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
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def _hash_refresh_token(token: str) -> str:
    """SHA-256 simples (nao PBKDF2) -- o refresh token e opaco, aleatorio e
    de alta entropia (`secrets.token_urlsafe`), diferente de senha
    (baixa entropia, precisa de KDF lento contra brute-force). O ponto
    aqui e so nunca guardar o valor em claro (mesmo principio de
    password_hash), nao dificultar forca bruta -- o espaco de busca de um
    token de 32 bytes ja torna isso inviavel."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_refresh_token(db: Session, user: User) -> str:
    """Gera um refresh token opaco novo, grava o HASH em `refresh_token`
    (Bloco 2) e devolve o valor bruto -- so existe em claro neste retorno,
    pra ser setado no cookie HttpOnly pelo router. Nao faz `db.commit()`
    (quem chama decide, mesmo padrao dos services de monitoramento)."""
    token = secrets.token_urlsafe(32)
    expira_em = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    db.add(RefreshToken(user_id=user.id, token_hash=_hash_refresh_token(token), expires_at=expira_em))
    return token


def rotate_refresh_token(db: Session, token: str) -> tuple[User, str]:
    """Valida o refresh token recebido (nao revogado, nao expirado), marca
    a linha antiga como revogada e emite um par novo -- rotacao real: reuso
    do token antigo (ja revogado) falha na proxima chamada, sinal de furto
    de sessao caso aconteca. Faz `db.commit()` (le-modifica-grava numa
    unica operacao atomica, diferente do padrao dos services de negocio
    que deixam o commit pro router -- aqui nao ha corpo de request pra
    coordenar com outra escrita)."""
    token_hash = _hash_refresh_token(token)
    registro = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()
    agora = datetime.now(timezone.utc)
    if registro is None or registro.revoked_at is not None or registro.expires_at < agora:
        raise HTTPException(status_code=401, detail="Sessao invalida ou expirada.")

    user = db.execute(select(User).where(User.id == registro.user_id)).scalar_one_or_none()
    if user is None or user.status != UserStatus.active or user.deleted_at is not None:
        raise HTTPException(status_code=403, detail="Usuario inexistente ou inativo.")

    registro.revoked_at = agora
    novo_token = create_refresh_token(db, user)
    db.commit()
    return user, novo_token


def set_session_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Seta os 2 cookies HttpOnly de sessao numa resposta -- usado por
    `/auth/login` e `/auth/refresh` (Bloco 2). `secure`/`samesite`/`domain`
    vem de settings (cross-site por padrao, ver config.py). Refresh fica
    restrito a `REFRESH_COOKIE_PATH` -- o browser so o envia de volta pra
    `/auth/refresh`, reduzindo a superficie de exposicao do cookie de vida
    mais longa."""
    response.set_cookie(
        ACCESS_COOKIE_NAME, access_token, max_age=settings.access_token_expire_minutes * 60,
        httponly=True, secure=settings.cookie_secure, samesite=settings.cookie_samesite,
        domain=settings.cookie_domain, path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME, refresh_token, max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True, secure=settings.cookie_secure, samesite=settings.cookie_samesite,
        domain=settings.cookie_domain, path=REFRESH_COOKIE_PATH,
    )


def clear_session_cookies(response: Response) -> None:
    """Logout (Bloco 2) -- limpa os 2 cookies no cliente. `path` precisa
    bater exatamente com o usado em `set_session_cookies` (o browser trata
    path como parte da identidade do cookie)."""
    response.delete_cookie(ACCESS_COOKIE_NAME, domain=settings.cookie_domain, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, domain=settings.cookie_domain, path=REFRESH_COOKIE_PATH)


def revoke_refresh_token(db: Session, token: str) -> None:
    """Logout real (Bloco 2) -- revoga no servidor, nao so limpa o cookie
    no cliente. Token ja invalido/inexistente e no-op silencioso (logout
    de uma sessao que ja caiu nao e erro)."""
    token_hash = _hash_refresh_token(token)
    registro = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()
    if registro is not None and registro.revoked_at is None:
        registro.revoked_at = datetime.now(timezone.utc)
        db.commit()


def _decodificar_access_token(token: str, db: Session) -> User:
    if not settings.jwt_secret:
        raise HTTPException(status_code=503, detail="JWT_SECRET nao configurado.")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token de acesso invalido.")

    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if user is None or user.status != UserStatus.active or user.deleted_at is not None:
        raise HTTPException(status_code=403, detail="Usuario inexistente ou inativo.")
    return user


def require_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Cookie HttpOnly primeiro (Bloco 2); header `Authorization: Bearer`
    continua aceito como fallback durante a fase de compatibilidade dupla
    do rollout (Plan Mode seguranca 2026-09-16, secao 2.8, Fase A/B) --
    removido quando a Fase C confirmar que nao ha mais trafego bearer."""
    token = request.cookies.get(ACCESS_COOKIE_NAME)
    if token is None:
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Token de acesso obrigatorio.")
        token = credentials.credentials
    return _decodificar_access_token(token, db)


def require_monitoramento_editor(user: User = Depends(require_current_user)) -> User:
    if user.role == UserRole.leitor:
        raise HTTPException(status_code=403, detail="Perfil leitor nao pode alterar monitoramento.")
    return user
