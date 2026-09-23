"""Autenticacao e autorizacao do backend."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, cast

import jwt
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.db.models import RefreshToken, User, UserRole, UserStatus

ALGORITHM = "HS256"
PBKDF2_ITERATIONS = 260_000

# Bloqueio de conta (Modulo de gestao de usuarios, 2026-09-17) -- alem do
# rate limit por IP (5/min em /auth/login, ver app/rate_limit.py), protege
# uma conta especifica sendo atacada de varios IPs/rotativos.
MAX_TENTATIVAS_LOGIN = 10
DURACAO_BLOQUEIO_CONTA = timedelta(minutes=15)

# Nomes dos cookies HttpOnly de sessao -- Bloco 2 do Plan Mode seguranca
# 2026-09-16. `path` do refresh fica restrito a /auth (prefixo -- cobre
# /auth/refresh e /auth/logout) pra reduzir a superficie de exposicao do
# cookie de vida mais longa sem deixar de chegar em /auth/logout.
#
# Bug real encontrado na consolidacao 2026-09-17 (Bloco 1, ao escrever o
# teste de CSRF pra /auth/logout): o path era literalmente "/auth/refresh"
# antes -- Path de cookie e' matching de PREFIXO, entao "/auth/refresh"
# NUNCA e enviado numa requisicao pra "/auth/logout" (paths irmaos, um nao
# e prefixo do outro). `revoke_refresh_token` em `logout()` nunca recebia o
# token, entao o logout nunca revogava nada no servidor -- so limpava
# cookie no cliente, exatamente o comportamento antigo que o Bloco 2 dizia
# ter corrigido. Mascarado porque o teste
# `test_logout_revoga_refresh_no_servidor` nao reenviava o cookie
# manualmente apos o logout (comentario dizia que reenviava, codigo nao
# fazia), entao o 401 esperado vinha da ausencia do cookie (limpo pelo
# proprio logout), nao de revogacao real -- corrigido junto (ver
# tests/test_auth_session.py).
ACCESS_COOKIE_NAME = "sigeo_access"
REFRESH_COOKIE_NAME = "sigeo_refresh"
REFRESH_COOKIE_PATH = "/auth"

# Cookie CSRF (Bloco 1 do Plan Mode consolidacao 2026-09-17) -- double-submit:
# NAO e HttpOnly de proposito (o frontend precisa ler o valor em JS pra
# ecoar no header abaixo). `SameSite=None`/`Secure` segue a mesma topologia
# cross-site do restante da sessao (ver `cookie_samesite`/`cookie_secure`).
CSRF_COOKIE_NAME = "sigeo_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"

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


def registrar_falha_login(db: Session, user: User) -> None:
    """Incrementa o contador de tentativas invalidas; ao atingir
    MAX_TENTATIVAS_LOGIN, bloqueia a conta por DURACAO_BLOQUEIO_CONTA e zera
    o contador (o bloqueio em si e o sinal, nao precisa continuar somando).
    Sem `db.commit()` -- quem chama decide (mesmo padrao do resto do
    modulo)."""
    user.failed_login_attempts += 1
    if user.failed_login_attempts >= MAX_TENTATIVAS_LOGIN:
        user.locked_until = datetime.now(timezone.utc) + DURACAO_BLOQUEIO_CONTA
        user.failed_login_attempts = 0


def registrar_sucesso_login(user: User) -> None:
    user.failed_login_attempts = 0
    user.locked_until = None


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
    de sessao caso aconteca.

    `UPDATE ... WHERE token_hash = :hash AND revoked_at IS NULL RETURNING
    user_id` atomico (Plan Mode database 2026-09-17, Bloco 1) em vez de
    SELECT + atribuicao + commit: duas requisicoes concorrentes com o
    mesmo token, sem isso, passavam ambas pela checagem `revoked_at is
    None` antes de qualquer commit e geravam dois sucessores do mesmo
    token pai. O UPDATE ja e atomico no Postgres -- a transacao
    concorrente bloqueia na mesma linha ate a primeira commitar e, ao
    reavaliar o WHERE, encontra `revoked_at` ja preenchido e afeta 0
    linhas, colapsando no mesmo 401 abaixo. Faz `db.commit()` (mesmo
    padrao de antes -- nao ha corpo de request pra coordenar com outra
    escrita)."""
    token_hash = _hash_refresh_token(token)
    agora = datetime.now(timezone.utc)
    resultado = db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=agora)
        .returning(RefreshToken.user_id, RefreshToken.expires_at)
    ).one_or_none()
    if resultado is None or resultado.expires_at < agora:
        db.rollback()
        raise HTTPException(status_code=401, detail="Sessao invalida ou expirada.")

    user = db.execute(select(User).where(User.id == resultado.user_id)).scalar_one_or_none()
    if user is None or user.status != UserStatus.active or user.deleted_at is not None:
        db.rollback()
        raise HTTPException(status_code=403, detail="Usuario inexistente ou inativo.")

    novo_token = create_refresh_token(db, user)
    db.commit()
    return user, novo_token


def set_session_cookies(response: Response, access_token: str, refresh_token: str) -> str:
    """Seta os 3 cookies de sessao numa resposta -- usado por `/auth/login`
    e `/auth/refresh` (Bloco 2 + Bloco 1 CSRF da consolidacao 2026-09-17).
    `secure`/`samesite`/`domain` vem de settings (cross-site por padrao, ver
    config.py). Refresh fica restrito a `REFRESH_COOKIE_PATH` -- o browser
    so o envia de volta pra `/auth/refresh`, reduzindo a superficie de
    exposicao do cookie de vida mais longa. O cookie CSRF e rotacionado
    junto (mesmo evento de emissao) e devolvido pra quem chamar poder
    expor o valor no corpo da resposta de login, se precisar."""
    same_site = cast(Literal["lax", "strict", "none"] | None, settings.cookie_samesite)
    response.set_cookie(
        ACCESS_COOKIE_NAME, access_token, max_age=settings.access_token_expire_minutes * 60,
        httponly=True, secure=settings.cookie_secure, samesite=same_site,
        domain=settings.cookie_domain, path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME, refresh_token, max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True, secure=settings.cookie_secure, samesite=same_site,
        domain=settings.cookie_domain, path=REFRESH_COOKIE_PATH,
    )
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE_NAME, csrf_token, max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=False, secure=settings.cookie_secure, samesite=same_site,
        domain=settings.cookie_domain, path="/",
    )
    return csrf_token


def clear_session_cookies(response: Response) -> None:
    """Logout (Bloco 2) -- limpa os 3 cookies no cliente. `path` precisa
    bater exatamente com o usado em `set_session_cookies` (o browser trata
    path como parte da identidade do cookie)."""
    response.delete_cookie(ACCESS_COOKIE_NAME, domain=settings.cookie_domain, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, domain=settings.cookie_domain, path=REFRESH_COOKIE_PATH)
    response.delete_cookie(CSRF_COOKIE_NAME, domain=settings.cookie_domain, path="/")


def revoke_refresh_token(db: Session, token: str) -> None:
    """Logout real (Bloco 2) -- revoga no servidor, nao so limpa o cookie
    no cliente. Token ja invalido/inexistente e no-op silencioso (logout
    de uma sessao que ja caiu nao e erro).

    `UPDATE` atomico (Plan Mode database 2026-09-17, Bloco 1) pelo mesmo
    motivo de `rotate_refresh_token` -- evita a janela SELECT + atribuicao
    + commit onde duas chamadas concorrentes (ex.: logout duplo) poderiam
    disputar a mesma linha."""
    token_hash = _hash_refresh_token(token)
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    db.commit()


def revoke_all_refresh_tokens_for_user(db: Session, user_id: int) -> None:
    """Inativacao de usuario (Modulo de gestao de usuarios, 2026-09-17) --
    sem isso, uma sessao ja aberta continuaria valida ate o access token
    expirar (ate `access_token_expire_minutes`) mesmo com a conta
    inativada. Nao faz `db.commit()` -- quem chama (Service) decide, junto
    da mudanca de `status`."""
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )


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


def require_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Cookie HttpOnly (Bloco 2) -- unica via de autenticacao. O fallback
    `Authorization: Bearer` da fase de compatibilidade dupla foi removido
    em 2026-09-17 (Bloco 2 do Plan Mode consolidacao): confirmado que os 3
    clientes HTTP do frontend (`api.ts`/`convenios.ts`/`monitoramento.ts`)
    ja operam so por cookie e nao ha consumidor externo de API."""
    token = request.cookies.get(ACCESS_COOKIE_NAME)
    if token is None:
        raise HTTPException(status_code=401, detail="Token de acesso obrigatorio.")
    return _decodificar_access_token(token, db)


def require_monitoramento_editor(user: User = Depends(require_current_user)) -> User:
    if user.role == UserRole.leitor:
        raise HTTPException(status_code=403, detail="Perfil leitor nao pode alterar monitoramento.")
    return user


def require_admin_user(user: User = Depends(require_current_user)) -> User:
    """Gate do modulo de gestao de usuarios -- diferente de
    `require_monitoramento_editor` (binario leitor vs resto), aqui so
    `role=admin` passa. `colaborador` mantem os poderes que ja tem no
    resto do app, so nao entra neste modulo."""
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Apenas administradores podem acessar este recurso.")
    return user
