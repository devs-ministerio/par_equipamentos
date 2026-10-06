"""Rotas de autenticacao."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import (
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    clear_session_cookies,
    create_access_token,
    create_refresh_token,
    hash_password,
    precisa_rehash,
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


def _detalhes_requisicao(request: Request) -> dict:
    """IP/user-agent do request -- só entra em `AuditLog.details` de eventos
    de auth (login/logout/ativação), nunca em log geral: é dado necessário
    pra investigar força bruta/sessão roubada (Módulo de Auditoria,
    2026-09-28), visível só a admin na tela de auditoria."""
    return {"ip": request.client.host if request.client else None, "user_agent": request.headers.get("user-agent")}


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, corpo: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Seta cookies de sessao (access + refresh + csrf, Bloco 2 + Bloco 1
    CSRF da consolidacao 2026-09-17). O bearer fallback e o `access_token`
    no corpo foram removidos em 2026-09-17 (Bloco 2) -- confirmado que os 3
    clientes HTTP do frontend ja operam so por cookie e nao ha consumidor
    externo de API."""
    detalhes = _detalhes_requisicao(request)
    user = db.execute(select(User).where(User.email == corpo.email.lower().strip())).scalar_one_or_none()
    # `activation_token_hash` NÃO bloqueia mais o login (correção 2026-09-30):
    # a mesma coluna guarda o token de "esqueci minha senha", então qualquer
    # pessoa que soubesse o e-mail de um técnico conseguia trancar o login
    # dele por 7 dias só pedindo recuperação. Convite pendente continua sem
    # acesso porque a senha gravada é aleatória e desconhecida (ver
    # `services/usuarios.py::criar_usuario`) -- quem entra é quem sabe a
    # senha. Link de redefinição pendente continua válido até usar/expirar.
    if user is None or user.status != UserStatus.active or user.deleted_at is not None:
        log_action(
            db,
            user_id=None,
            entity_name="auth",
            entity_id=None,
            action="login_falha",
            details={"email": corpo.email.lower().strip(), **detalhes},
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")
    if user.locked_until is not None and user.locked_until > datetime.now(timezone.utc):
        # Mesma mensagem generica de credencial invalida -- nao sinalizar
        # pra quem tenta logar que a conta esta bloqueada (diferenciar
        # ajudaria um atacante a saber que acertou o e-mail).
        log_action(
            db, user_id=user.id, entity_name="auth", entity_id=user.id, action="login_bloqueado", details=detalhes
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")
    if not verify_password(corpo.password, user.password_hash):
        registrar_falha_login(db, user)
        log_action(db, user_id=user.id, entity_name="auth", entity_id=user.id, action="login_falha", details=detalhes)
        db.commit()
        raise HTTPException(status_code=401, detail="Email ou senha invalidos.")

    # Migração de KDF (Plan Mode fechamento final 2026-09-25, Bloco 6) --
    # sem reset em massa: hash legado (PBKDF2) vira argon2id no primeiro
    # login bem-sucedido depois do deploy, silenciosamente.
    if precisa_rehash(user.password_hash):
        user.password_hash = hash_password(corpo.password)

    registrar_sucesso_login(user)
    log_action(db, user_id=user.id, entity_name="auth", entity_id=user.id, action="login_sucesso", details=detalhes)
    refresh_token, refresh_token_id = create_refresh_token(db, user)
    access_token = create_access_token(user, refresh_token_id)
    db.commit()
    csrf_token = set_session_cookies(response, access_token, refresh_token)
    # O cookie CSRF continua sendo a cópia que o servidor compara. O corpo
    # também o devolve para manter compatibilidade com origens separadas,
    # sem relaxar CSRF.
    return {"status": "ok", "csrf_token": csrf_token}


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
    log_action(
        db,
        user_id=user.id,
        entity_name="auth",
        entity_id=user.id,
        action="conta_ativada",
        details=_detalhes_requisicao(request),
    )
    db.commit()
    refresh_token, refresh_token_id = create_refresh_token(db, user)
    csrf_token = set_session_cookies(response, create_access_token(user, refresh_token_id), refresh_token)
    db.commit()
    return {"status": "ok", "csrf_token": csrf_token}


@router.post("/esqueci-senha")
@limiter.limit("3/minute")
def esqueci_senha(request: Request, corpo: PasswordRecoveryRequest, db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(User.email == corpo.email.lower().strip(), User.deleted_at.is_(None))
    ).scalar_one_or_none()
    if user is not None and user.status == UserStatus.active and settings.servico_email_configurado:
        token = secrets.token_urlsafe(32)
        user.activation_token_hash = hashlib.sha256(token.encode()).hexdigest()
        user.activation_expires_at = datetime.now(timezone.utc) + timedelta(weeks=1)
        # Envia ANTES de gravar (correção 2026-09-30): antes o commit vinha
        # primeiro e o `rollback` do except não desfazia nada -- o token
        # ficava gravado mesmo sem o e-mail ter saído. Falha no gateway agora
        # descarta a alteração; a resposta continua genérica (não revela se
        # o e-mail existe).
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
        else:
            db.commit()
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
    # Quem redefiniu a senha provou posse do e-mail: destrava a conta
    # (contador de falhas/bloqueio temporário) junto.
    registrar_sucesso_login(user)
    revoke_all_refresh_tokens_for_user(db, user.id)
    db.commit()
    refresh_token, refresh_token_id = create_refresh_token(db, user)
    csrf_token = set_session_cookies(response, create_access_token(user, refresh_token_id), refresh_token)
    db.commit()
    return {"status": "ok", "csrf_token": csrf_token}


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
    csrf_token = set_session_cookies(response, novo_access, novo_refresh)
    return {"status": "ok", "csrf_token": csrf_token}


@router.get("/csrf")
def fornecer_csrf(request: Request, response: Response):
    """Entrega a cópia CSRF à origem autorizada após um reload do frontend.

    Em produção, o cookie pertence ao host da API e não aparece em
    ``document.cookie`` do Vercel. O navegador ainda o envia à API com
    ``credentials: include``; esta rota de leitura devolve o mesmo valor
    somente a quem a política CORS permite ler. Sem cookie não há token nem
    sessão para reutilizar.
    """
    csrf_token = request.cookies.get(CSRF_COOKIE_NAME)
    if csrf_token is None:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.")
    response.headers["Cache-Control"] = "no-store"
    return {"csrf_token": csrf_token}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Revoga a sessao no servidor (Bloco 2) -- diferente do comportamento
    antigo (so removia o token do navegador, JWT continuava valido ate
    expirar)."""
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if token is not None:
        user_id = revoke_refresh_token(db, token)
        if user_id is not None:
            log_action(db, user_id=user_id, entity_name="auth", entity_id=user_id, action="logout")
            db.commit()
    clear_session_cookies(response)
    return {"status": "ok"}


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(require_current_user)):
    return user
