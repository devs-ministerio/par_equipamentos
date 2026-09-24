"""Rotas de autenticacao."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    REFRESH_COOKIE_NAME,
    clear_session_cookies,
    create_access_token,
    create_refresh_token,
    hash_password,
    registrar_falha_login,
    registrar_sucesso_login,
    require_current_user,
    revoke_all_refresh_tokens_for_user,
    revoke_refresh_token,
    rotate_refresh_token,
    set_session_cookies,
    verify_password,
)
from app.config import settings
from app.db.base import get_db
from app.db.models import User, UserStatus
from app.email import enviar_link
from app.rate_limit import limiter
from app.schemas import LoginRequest, PasswordRecoveryRequest, PasswordResetRequest, UserActivationRequest, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, corpo: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Seta cookies de sessao (access + refresh + csrf, Bloco 2 + Bloco 1
    CSRF da consolidacao 2026-09-17). O bearer fallback e o `access_token`
    no corpo foram removidos em 2026-09-17 (Bloco 2) -- confirmado que os 3
    clientes HTTP do frontend ja operam so por cookie e nao ha consumidor
    externo de API."""
    user = db.execute(select(User).where(User.email == corpo.email.lower().strip())).scalar_one_or_none()
    if (
        user is None
        or user.status != UserStatus.active
        or user.deleted_at is not None
        or user.activation_token_hash is not None
    ):
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")
    if user.locked_until is not None and user.locked_until > datetime.now(timezone.utc):
        # Mesma mensagem generica de credencial invalida -- nao sinalizar
        # pra quem tenta logar que a conta esta bloqueada (diferenciar
        # ajudaria um atacante a saber que acertou o e-mail).
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")
    if not verify_password(corpo.password, user.password_hash):
        registrar_falha_login(db, user)
        db.commit()
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")

    registrar_sucesso_login(user)
    refresh_token, refresh_token_id = create_refresh_token(db, user)
    access_token = create_access_token(user, refresh_token_id)
    db.commit()
    set_session_cookies(response, access_token, refresh_token)
    return {"status": "ok"}


@router.post("/ativar")
@limiter.limit("5/minute")
def ativar(request: Request, corpo: UserActivationRequest, response: Response, db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(User.activation_token_hash == hashlib.sha256(corpo.token.encode()).hexdigest())
    ).scalar_one_or_none()
    if user is None or user.activation_expires_at is None or user.activation_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Convite inválido ou expirado.")
    user.password_hash = hash_password(corpo.password)
    user.activation_token_hash = None
    user.activation_expires_at = None
    user.activated_at = datetime.now(timezone.utc)
    registrar_sucesso_login(user)
    db.commit()
    refresh_token, refresh_token_id = create_refresh_token(db, user)
    set_session_cookies(response, create_access_token(user, refresh_token_id), refresh_token)
    db.commit()
    return {"status": "ok"}


@router.post("/esqueci-senha")
@limiter.limit("3/minute")
def esqueci_senha(request: Request, corpo: PasswordRecoveryRequest, db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(User.email == corpo.email.lower().strip(), User.deleted_at.is_(None))
    ).scalar_one_or_none()
    if user is not None and settings.servico_email_configurado:
        token = secrets.token_urlsafe(32)
        user.activation_token_hash = hashlib.sha256(token.encode()).hexdigest()
        user.activation_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        db.commit()
        try:
            enviar_link(
                destinatario=user.email,
                nome=user.name,
                token=token,
                assunto="Redefina sua senha do SIGEO",
                caminho="/redefinir-senha",
            )
        except Exception:
            db.rollback()
    return {"status": "ok"}


@router.post("/redefinir-senha")
@limiter.limit("5/minute")
def redefinir_senha(request: Request, corpo: PasswordResetRequest, response: Response, db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(User.activation_token_hash == hashlib.sha256(corpo.token.encode()).hexdigest())
    ).scalar_one_or_none()
    if user is None or user.activation_expires_at is None or user.activation_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token inválido ou expirado.")
    user.password_hash = hash_password(corpo.password)
    user.activation_token_hash = None
    user.activation_expires_at = None
    user.activated_at = user.activated_at or datetime.now(timezone.utc)
    revoke_all_refresh_tokens_for_user(db, user.id)
    db.commit()
    refresh_token, refresh_token_id = create_refresh_token(db, user)
    set_session_cookies(response, create_access_token(user, refresh_token_id), refresh_token)
    db.commit()
    return {"status": "ok"}


@router.post("/refresh")
@limiter.limit("30/minute")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    """Rotaciona a sessao a partir do cookie de refresh -- reuso de um
    refresh ja rotacionado/revogado falha (`rotate_refresh_token`), nao
    "renova" silenciosamente."""
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if token is None:
        raise HTTPException(status_code=401, detail="Sessao invalida ou expirada.")
    user, novo_refresh, nova_sessao_id = rotate_refresh_token(db, token)
    novo_access = create_access_token(user, nova_sessao_id)
    set_session_cookies(response, novo_access, novo_refresh)
    return {"status": "ok"}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Revoga a sessao no servidor (Bloco 2) -- diferente do comportamento
    antigo (so removia o token do navegador, JWT continuava valido ate
    expirar)."""
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if token is not None:
        revoke_refresh_token(db, token)
    clear_session_cookies(response)
    return {"status": "ok"}


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(require_current_user)):
    return user
