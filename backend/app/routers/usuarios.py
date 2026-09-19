"""Gestao de usuarios (Modulo Admin, 2026-09-17) -- Router fino (mesmo
padrao de `notificacoes.py`): so monta `Depends`, chama o Service e devolve
o retorno. Regra de negocio e commit vivem em `app/services/usuarios.py`;
query direta vive em `app/repositories/usuarios.py`. Toda rota exige
`require_admin_user` -- diferente do resto do app (gate binario
leitor/resto), aqui so `role=admin` passa (ver `app/auth.py`)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_admin_user
from app.db.base import get_db
from app.db.models import User, UserRole, UserStatus
from app.schemas import (
    UserCreateRequest,
    UserListResponse,
    UserRead,
    UserResetPasswordResponse,
    UserUpdateRequest,
)
from app.services.usuarios import (
    atualizar_usuario,
    criar_usuario,
    inativar_usuario,
    listar_usuarios,
    reativar_usuario,
    reenviar_convite,
    resetar_senha,
)

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("", response_model=UserListResponse)
def listar(
    limit: int = 20,
    offset: int = 0,
    busca: str | None = None,
    role: UserRole | None = None,
    status: UserStatus | None = None,
    db: Session = Depends(get_db),
    admin_atual: User = Depends(require_admin_user),
):
    pagina = listar_usuarios(
        db=db, admin_atual=admin_atual, limit=limit, offset=offset, busca=busca, role=role, status=status
    )
    itens = [UserRead.model_validate(u) for u in pagina.itens]
    return UserListResponse(itens=itens, total=pagina.total)


@router.post("", response_model=UserRead, status_code=201)
def criar(
    corpo: UserCreateRequest,
    db: Session = Depends(get_db),
    admin_atual: User = Depends(require_admin_user),
):
    return criar_usuario(db=db, admin_atual=admin_atual, dados=corpo)


@router.patch("/{user_id}", response_model=UserRead)
def atualizar(
    user_id: int,
    corpo: UserUpdateRequest,
    db: Session = Depends(get_db),
    admin_atual: User = Depends(require_admin_user),
):
    return atualizar_usuario(db=db, admin_atual=admin_atual, user_id=user_id, dados=corpo)


@router.post("/{user_id}/resetar-senha", response_model=UserResetPasswordResponse)
def resetar_senha_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    admin_atual: User = Depends(require_admin_user),
):
    senha_temporaria = resetar_senha(db=db, admin_atual=admin_atual, user_id=user_id)
    return UserResetPasswordResponse(senha_temporaria=senha_temporaria)


@router.post("/{user_id}/reenviar-convite", response_model=UserRead)
def reenviar(user_id: int, db: Session = Depends(get_db), admin_atual: User = Depends(require_admin_user)):
    return reenviar_convite(db=db, admin_atual=admin_atual, user_id=user_id)


@router.post("/{user_id}/inativar", response_model=UserRead)
def inativar(
    user_id: int,
    db: Session = Depends(get_db),
    admin_atual: User = Depends(require_admin_user),
):
    return inativar_usuario(db=db, admin_atual=admin_atual, user_id=user_id)


@router.post("/{user_id}/reativar", response_model=UserRead)
def reativar(
    user_id: int,
    db: Session = Depends(get_db),
    admin_atual: User = Depends(require_admin_user),
):
    return reativar_usuario(db=db, admin_atual=admin_atual, user_id=user_id)
