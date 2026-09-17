"""Rotas de autenticacao."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    REFRESH_COOKIE_NAME,
    clear_session_cookies,
    create_access_token,
    create_refresh_token,
    require_current_user,
    revoke_refresh_token,
    rotate_refresh_token,
    set_session_cookies,
    verify_password,
)
from app.db.base import get_db
from app.db.models import User, UserStatus
from app.rate_limit import limiter
from app.schemas import LoginRequest, TokenResponse, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, corpo: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Seta cookies HttpOnly (access + refresh, Bloco 2) e -- durante a
    fase de compatibilidade dupla do rollout (Plan Mode seguranca
    2026-09-16, secao 2.8) -- continua devolvendo `access_token` no corpo,
    pro frontend que ainda nao migrou de `localStorage`/`Authorization`
    header pra `credentials: 'include'`. Remover o corpo quando a Fase C
    confirmar que nao ha mais consumidor do token via header."""
    user = db.execute(select(User).where(User.email == corpo.email.lower().strip())).scalar_one_or_none()
    if user is None or user.status != UserStatus.active or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")
    if not verify_password(corpo.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")

    access_token = create_access_token(user)
    refresh_token = create_refresh_token(db, user)
    db.commit()
    set_session_cookies(response, access_token, refresh_token)
    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    """Rotaciona a sessao a partir do cookie de refresh -- reuso de um
    refresh ja rotacionado/revogado falha (`rotate_refresh_token`), nao
    "renova" silenciosamente."""
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if token is None:
        raise HTTPException(status_code=401, detail="Sessao invalida ou expirada.")
    user, novo_refresh = rotate_refresh_token(db, token)
    novo_access = create_access_token(user)
    set_session_cookies(response, novo_access, novo_refresh)
    return TokenResponse(access_token=novo_access)


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
