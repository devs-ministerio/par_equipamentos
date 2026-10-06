"""Autenticacao e autorizacao do backend."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, cast

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.audit import log_action
from app.config import settings
from app.db.base import get_db
from app.db.models import RefreshToken, User, UserRole, UserStatus

ALGORITHM = "HS256"
PBKDF2_ITERATIONS = 260_000

# Migração de KDF (Plan Mode fechamento final 2026-09-25, Bloco 6) --
# argon2id é o hash de senha recomendado hoje; PBKDF2-HMAC-SHA256 (acima)
# fica só como formato legado pra verificar hash já gravado, nunca mais
# produzido em hash_password novo. Sem reset em massa: cada usuário migra
# sozinho no próximo login bem-sucedido (ver `precisa_rehash`/uso em
# app/routers/auth.py::login).
_argon2_hasher = PasswordHasher()

# Bloqueio de conta (Modulo de gestao de usuarios, 2026-09-17) -- alem do
# rate limit por IP (5/min em /auth/login, ver app/rate_limit.py), protege
# uma conta especifica sendo atacada de varios IPs/rotativos.
MAX_TENTATIVAS_LOGIN = 10
DURACAO_BLOQUEIO_CONTA = timedelta(minutes=15)

# Nomes dos cookies HttpOnly de sessao -- Bloco 2 do Plan Mode seguranca
# 2026-09-16. `path` do refresh fica restrito a um prefixo (cobre
# /auth/refresh e /auth/logout, ou /api/auth/refresh e /api/auth/logout em
# producao -- ver `Settings.refresh_cookie_path`) pra reduzir a superficie
# de exposicao do cookie de vida mais longa sem deixar de chegar em
# /auth/logout.
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
#
# Segundo bug real, mesma classe de erro, achado ao vivo 2026-09-28 apos o
# proxy same-origin `/api` entrar em producao: o browser passou a contatar
# "/api/auth/refresh", mas o Path continuava "/auth" -- prefixo que NUNCA
# bate com "/api/auth/refresh". O cookie de refresh parava de ser enviado
# em producao, toda renovacao de sessao falhava com 401 silencioso, e o
# frontend (que confirma a sessao com /auth/me logo apos login) reportava
# "Não foi possível concluir a sessão" mesmo com login e cookies corretos.
ACCESS_COOKIE_NAME = "sigeo_access"
REFRESH_COOKIE_NAME = "sigeo_refresh"

# Cookie CSRF (Bloco 1 do Plan Mode consolidacao 2026-09-17) -- double-submit:
# NAO e HttpOnly de proposito (o frontend precisa ler o valor em JS pra
# ecoar no header abaixo). `Secure` e `SameSite=Lax` acompanham a sessão
# same-origin exposta pelo proxy `/api` (ver `cookie_samesite`).
CSRF_COOKIE_NAME = "sigeo_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"


def hash_password(password: str) -> str:
    """Sempre produz argon2id -- PBKDF2 (abaixo) só é lido, nunca gravado
    de novo a partir daqui."""
    return _argon2_hasher.hash(password)


def _verify_pbkdf2(password: str, password_hash: str) -> bool:
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


def verify_password(password: str, password_hash: str) -> bool:
    if password_hash.startswith("pbkdf2_sha256$"):
        return _verify_pbkdf2(password, password_hash)
    try:
        return _argon2_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def precisa_rehash(password_hash: str) -> bool:
    """PBKDF2 legado sempre precisa migrar; hash argon2id já gravado só
    precisa se os parâmetros (memória/tempo/paralelismo) do hasher atual
    mudaram desde que foi criado."""
    if password_hash.startswith("pbkdf2_sha256$"):
        return True
    try:
        return _argon2_hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


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


def create_access_token(user: User, refresh_token_id: int) -> str:
    if not settings.jwt_secret:
        raise HTTPException(status_code=503, detail="JWT_SECRET nao configurado.")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        # O access token pertence a uma sessão de refresh concreta. Assim,
        # revogar aquela sessão no logout também invalida imediatamente um
        # access cookie que tenha sido copiado antes de o navegador apagá-lo.
        "sid": refresh_token_id,
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


def create_refresh_token(db: Session, user: User, session_started_at: datetime | None = None) -> tuple[str, int]:
    """Gera um refresh token opaco novo, grava o HASH em `refresh_token`
    (Bloco 2) e devolve o valor bruto -- so existe em claro neste retorno,
    pra ser setado no cookie HttpOnly pelo router. Nao faz `db.commit()`
    (quem chama decide, mesmo padrao dos services de monitoramento).

    `session_started_at` so e passado por `rotate_refresh_token`, pra
    propagar o inicio da cadeia (login original) e sustentar o teto
    absoluto (2026-10-05) -- login novo (sem argumento) comeca uma cadeia
    nova, com `session_started_at` = agora."""
    agora = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    expira_em = agora + timedelta(days=settings.refresh_token_expire_days)
    sessao = RefreshToken(
        user_id=user.id,
        token_hash=_hash_refresh_token(token),
        expires_at=expira_em,
        last_used_at=agora,
        session_started_at=session_started_at or agora,
    )
    db.add(sessao)
    # O id e colocado no JWT de acesso. `flush` preserva a transação para
    # quem chama decidir o commit, mas já materializa a identidade da sessão.
    db.flush()
    return token, sessao.id


def rotate_refresh_token(db: Session, token: str) -> tuple[User, str, int]:
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
        .returning(
            RefreshToken.user_id,
            RefreshToken.expires_at,
            RefreshToken.last_used_at,
            RefreshToken.session_started_at,
        )
    ).one_or_none()
    if resultado is None:
        # 0 linhas afetadas: token inexistente (garbage) OU ja revogado. Um
        # token que EXISTE mas ja esta revogado e o sinal de reuso (Modulo de
        # Auditoria, 2026-09-28) -- possivel sessao roubada, vale registrar
        # mesmo sem poder identificar o usuario com certeza (o token pode ja
        # ter sido rotacionado varias vezes).
        sessao_revogada = db.execute(
            select(RefreshToken.user_id).where(RefreshToken.token_hash == token_hash)
        ).scalar_one_or_none()
        if sessao_revogada is not None:
            # Reuso = alguém tem uma cópia do token (sessão possivelmente
            # roubada). Não dá pra saber qual lado é o legítimo, então todas
            # as sessões do usuário caem (correção 2026-09-30: antes só
            # registrava, e quem renovou primeiro -- às vezes o invasor --
            # seguia logado por até 14 dias). O usuário legítimo só precisa
            # entrar de novo.
            revoke_all_refresh_tokens_for_user(db, sessao_revogada)
            log_action(
                db,
                user_id=sessao_revogada,
                entity_name="auth",
                entity_id=sessao_revogada,
                action="refresh_reuso_detectado",
                details={"sessoes_revogadas": "todas"},
            )
            db.commit()
        else:
            db.rollback()
        raise HTTPException(status_code=401, detail="Sessao invalida ou expirada.")
    # Teto absoluto (sempre) + expiracao de fallback da linha (14 dias,
    # defesa em profundidade caso os settings de idle/absoluto fiquem mal
    # configurados). Checados ANTES do idle pra reportar o motivo certo
    # quando os dois batem ao mesmo tempo.
    limite_absoluto = resultado.session_started_at + timedelta(minutes=settings.refresh_absolute_timeout_minutes)
    if resultado.expires_at < agora or limite_absoluto < agora:
        db.rollback()
        raise HTTPException(status_code=401, detail="Sessao invalida ou expirada.")

    # Timeout por inatividade (2026-10-05): sem chamada nenhuma desde
    # `last_used_at` por mais que o limite -- mata a sessao mesmo com
    # `expires_at`/teto absoluto ainda longe. E' o que faltava pro achado
    # "abrir o app 1x a cada 14 dias nunca desloga".
    limite_idle = resultado.last_used_at + timedelta(minutes=settings.refresh_idle_timeout_minutes)
    if limite_idle < agora:
        db.rollback()
        raise HTTPException(status_code=401, detail="Sessao expirada por inatividade.")

    user = db.execute(select(User).where(User.id == resultado.user_id)).scalar_one_or_none()
    if user is None or user.status != UserStatus.active or user.deleted_at is not None:
        db.rollback()
        raise HTTPException(status_code=403, detail="Usuario inexistente ou inativo.")

    novo_token, nova_sessao_id = create_refresh_token(db, user, session_started_at=resultado.session_started_at)
    db.commit()
    return user, novo_token, nova_sessao_id


def set_session_cookies(response: Response, access_token: str, refresh_token: str) -> str:
    """Seta os 3 cookies de sessao numa resposta -- usado por `/auth/login`
    e `/auth/refresh` (Bloco 2 + Bloco 1 CSRF da consolidacao 2026-09-17).
    `secure`/`samesite`/`domain` vem de settings (same-origin via proxy,
    ver config.py). Refresh fica restrito a `settings.refresh_cookie_path` -- o browser
    so o envia de volta pra `/auth/refresh`, reduzindo a superficie de
    exposicao do cookie de vida mais longa. O cookie CSRF e rotacionado
    junto (mesmo evento de emissao) e devolvido pra quem chamar poder
    expor o valor no corpo da resposta de login, se precisar."""
    same_site = cast(Literal["lax", "strict", "none"] | None, settings.cookie_samesite)
    response.set_cookie(
        ACCESS_COOKIE_NAME,
        access_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=same_site,
        domain=settings.cookie_domain,
        path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=same_site,
        domain=settings.cookie_domain,
        path=settings.refresh_cookie_path,
    )
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=False,
        secure=settings.cookie_secure,
        samesite=same_site,
        domain=settings.cookie_domain,
        path="/",
    )
    return csrf_token


def clear_session_cookies(response: Response) -> None:
    """Logout (Bloco 2) -- limpa os 3 cookies no cliente. `path` precisa
    bater exatamente com o usado em `set_session_cookies` (o browser trata
    path como parte da identidade do cookie)."""
    response.delete_cookie(ACCESS_COOKIE_NAME, domain=settings.cookie_domain, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, domain=settings.cookie_domain, path=settings.refresh_cookie_path)
    response.delete_cookie(CSRF_COOKIE_NAME, domain=settings.cookie_domain, path="/")


def revoke_refresh_token(db: Session, token: str) -> int | None:
    """Logout real (Bloco 2) -- revoga no servidor, nao so limpa o cookie
    no cliente. Token ja invalido/inexistente e no-op silencioso (logout
    de uma sessao que ja caiu nao e erro).

    `UPDATE` atomico (Plan Mode database 2026-09-17, Bloco 1) pelo mesmo
    motivo de `rotate_refresh_token` -- evita a janela SELECT + atribuicao
    + commit onde duas chamadas concorrentes (ex.: logout duplo) poderiam
    disputar a mesma linha.

    Devolve o `user_id` da sessao revogada (`None` se o token ja estava
    invalido) -- usado pelo router pra gravar `log_action` do logout sem
    precisar decodificar o access token de novo (Modulo de Auditoria,
    2026-09-28)."""
    token_hash = _hash_refresh_token(token)
    resultado = db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
        .returning(RefreshToken.user_id)
    ).scalar_one_or_none()
    db.commit()
    return resultado


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
        refresh_token_id = int(payload["sid"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token de acesso invalido.")

    agora = datetime.now(timezone.utc)
    sessao = db.execute(
        select(RefreshToken).where(
            RefreshToken.id == refresh_token_id,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > agora,
        )
    ).scalar_one_or_none()
    if sessao is None:
        raise HTTPException(status_code=401, detail="Sessao invalida ou expirada.")

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
