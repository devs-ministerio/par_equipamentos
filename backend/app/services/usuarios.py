"""Casos de uso do Modulo de gestao de usuarios (Admin), 2026-09-17.

Primeiro consumidor real de `AuditLog` (existia no schema desde a base do
projeto, zero uso ate aqui). Escrevia via um `registrar_auditoria` proprio
deste arquivo -- consolidado em `app/audit.py::log_action` no Modulo de
Auditoria (2026-09-28), que e o segundo consumidor real que a duplicacao
dizia esperar.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import hash_password, revoke_all_refresh_tokens_for_user
from app.authz import assert_e_admin
from app.config import settings
from app.db.models import User, UserRole, UserStatus
from app.domain_errors import ConflictError, NotFoundError, ValidationError
from app.email import enviar_link
from app.repositories.usuarios import (
    PaginaUsuarios,
    listar_usuarios_paginados,
    obter_usuario_por_email,
    obter_usuario_por_id,
)
from app.schemas import UserCreateRequest, UserUpdateRequest


def listar_usuarios(
    *,
    db: Session,
    admin_atual: User,
    limit: int,
    offset: int,
    busca: str | None,
    role: UserRole | None,
    status: UserStatus | None,
) -> PaginaUsuarios:
    assert_e_admin(admin_atual)
    return listar_usuarios_paginados(db, limit=limit, offset=offset, busca=busca, role=role, status=status)


def criar_usuario(*, db: Session, admin_atual: User, dados: UserCreateRequest) -> User:
    assert_e_admin(admin_atual)
    if obter_usuario_por_email(db, dados.email) is not None:
        raise ConflictError(f"Ja existe um usuario com o e-mail {dados.email}.")

    if dados.password is None and not settings.servico_email_configurado:
        raise ValidationError("Serviço de e-mail não configurado para enviar o convite.")
    token = secrets.token_urlsafe(32)
    usuario = User(
        name=dados.name,
        email=dados.email.lower().strip(),
        password_hash=hash_password(dados.password or secrets.token_urlsafe(32)),
        role=dados.role,
        status=UserStatus.active,
    )
    if dados.password is None:
        usuario.activation_token_hash = hashlib.sha256(token.encode()).hexdigest()
        usuario.activation_expires_at = datetime.now(timezone.utc) + timedelta(weeks=1)
    db.add(usuario)
    db.flush()  # obtem usuario.id pra registrar na auditoria antes do commit
    log_action(
        db,
        user_id=admin_atual.id,
        entity_name="user",
        entity_id=usuario.id,
        action="criar_usuario",
        details={"email": usuario.email, "role": usuario.role.value},
    )
    if dados.password is None:
        try:
            enviar_link(
                destinatario=usuario.email,
                nome=usuario.name,
                token=token,
                assunto="Ative seu acesso ao SIGEO",
                caminho="/ativar",
            )
        except Exception as exc:
            db.rollback()
            raise ValidationError("Não foi possível enviar o convite por e-mail.") from exc
    db.commit()
    db.refresh(usuario)
    return usuario


def atualizar_usuario(*, db: Session, admin_atual: User, user_id: int, dados: UserUpdateRequest) -> User:
    assert_e_admin(admin_atual)
    usuario = obter_usuario_por_id(db, user_id)
    if usuario is None:
        raise NotFoundError(f"Usuario {user_id} nao encontrado.")
    if usuario.id == admin_atual.id and dados.role != UserRole.admin:
        raise ValidationError("Voce nao pode remover seu proprio papel de administrador.")

    usuario.name = dados.name
    usuario.role = dados.role
    log_action(
        db,
        user_id=admin_atual.id,
        entity_name="user",
        entity_id=usuario.id,
        action="atualizar_usuario",
        details={"name": usuario.name, "role": usuario.role.value},
    )
    db.commit()
    db.refresh(usuario)
    return usuario


def reenviar_convite(*, db: Session, admin_atual: User, user_id: int) -> User:
    assert_e_admin(admin_atual)
    usuario = obter_usuario_por_id(db, user_id)
    if usuario is None:
        raise NotFoundError(f"Usuario {user_id} nao encontrado.")
    token = secrets.token_urlsafe(32)
    usuario.activation_token_hash = hashlib.sha256(token.encode()).hexdigest()
    usuario.activation_expires_at = datetime.now(timezone.utc) + timedelta(weeks=1)
    try:
        enviar_link(
            destinatario=usuario.email,
            nome=usuario.name,
            token=token,
            assunto="Ative seu acesso ao SIGEO",
            caminho="/ativar",
        )
    except Exception as exc:
        db.rollback()
        raise ValidationError("Não foi possível enviar o convite por e-mail.") from exc
    log_action(db, user_id=admin_atual.id, entity_name="user", entity_id=usuario.id, action="reenviar_convite")
    db.commit()
    db.refresh(usuario)
    return usuario


def enviar_redefinicao_senha(*, db: Session, admin_atual: User, user_id: int) -> User:
    """Envia ao usuário um token opaco de redefinição, sem nunca gerar ou
    devolver senha em claro. O token só existe neste escopo para compor o
    e-mail; o banco guarda exclusivamente seu hash."""
    assert_e_admin(admin_atual)
    usuario = obter_usuario_por_id(db, user_id)
    if usuario is None:
        raise NotFoundError(f"Usuario {user_id} nao encontrado.")
    if not settings.servico_email_configurado:
        raise ValidationError("Serviço de e-mail não configurado para enviar a redefinição.")

    token = secrets.token_urlsafe(32)
    usuario.activation_token_hash = hashlib.sha256(token.encode()).hexdigest()
    usuario.activation_expires_at = datetime.now(timezone.utc) + timedelta(weeks=1)
    try:
        enviar_link(
            destinatario=usuario.email,
            nome=usuario.name,
            token=token,
            assunto="Redefina sua senha do SIGEO",
            caminho="/redefinir-senha",
        )
    except Exception as exc:
        db.rollback()
        raise ValidationError("Não foi possível enviar a redefinição por e-mail.") from exc
    log_action(
        db,
        user_id=admin_atual.id,
        entity_name="user",
        entity_id=usuario.id,
        action="enviar_redefinicao_senha",
    )
    db.commit()
    db.refresh(usuario)
    return usuario


def inativar_usuario(*, db: Session, admin_atual: User, user_id: int) -> User:
    assert_e_admin(admin_atual)
    usuario = obter_usuario_por_id(db, user_id)
    if usuario is None:
        raise NotFoundError(f"Usuario {user_id} nao encontrado.")
    if usuario.id == admin_atual.id:
        raise ValidationError("Voce nao pode inativar sua propria conta.")

    usuario.status = UserStatus.inactive
    revoke_all_refresh_tokens_for_user(db, usuario.id)
    log_action(db, user_id=admin_atual.id, entity_name="user", entity_id=usuario.id, action="inativar_usuario")
    db.commit()
    db.refresh(usuario)
    return usuario


def reativar_usuario(*, db: Session, admin_atual: User, user_id: int) -> User:
    assert_e_admin(admin_atual)
    usuario = obter_usuario_por_id(db, user_id)
    if usuario is None:
        raise NotFoundError(f"Usuario {user_id} nao encontrado.")

    usuario.status = UserStatus.active
    log_action(db, user_id=admin_atual.id, entity_name="user", entity_id=usuario.id, action="reativar_usuario")
    db.commit()
    db.refresh(usuario)
    return usuario
