"""Rotas de autenticacao."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import create_access_token, require_current_user, verify_password
from app.db.base import get_db
from app.db.models import User, UserStatus
from app.schemas import LoginRequest, TokenResponse, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(corpo: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == corpo.email.lower().strip())).scalar_one_or_none()
    if user is None or user.status != UserStatus.active or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")
    if not verify_password(corpo.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")
    return TokenResponse(access_token=create_access_token(user))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(require_current_user)):
    return user
