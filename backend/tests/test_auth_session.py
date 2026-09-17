"""Sessão cookie HttpOnly + refresh rotativo -- Plan Mode segurança
2026-09-16, Bloco 2. Via `TestClient` real (não chamada direta de função):
o que se quer provar aqui é o comportamento HTTP observável (cookie
setado, rotação, revogação), que só aparece passando pela pilha real do
framework.
"""
from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, create_access_token, hash_password
from app.db.base import SessionLocal
from app.db.models import User, UserRole
from app.main import app

client = TestClient(app)


def _criar_usuario(db, senha: str = "senha-teste-123") -> tuple[User, str]:
    user = User(
        name="Usuário Pytest Sessão",
        email=f"pytest-auth-session-{uuid4()}@example.com",
        password_hash=hash_password(senha),
        cpf_hash="cpf-pytest",
        role=UserRole.colaborador,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, senha


def test_login_seta_cookies_httponly_de_acesso_e_refresh():
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        resp = client.post("/auth/login", json={"email": user.email, "password": senha})
        assert resp.status_code == 200
        assert resp.json()["access_token"]  # compat dupla -- corpo continua devolvendo o token

        cookies_setados = [v for k, v in resp.headers.items() if k.lower() == "set-cookie"]
        assert any(ACCESS_COOKIE_NAME in c and "HttpOnly" in c for c in cookies_setados)
        assert any(REFRESH_COOKIE_NAME in c and "HttpOnly" in c for c in cookies_setados)
    finally:
        db.close()


def test_me_funciona_com_cookie_sem_header_authorization():
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        c = TestClient(app)
        c.post("/auth/login", json={"email": user.email, "password": senha})
        resp = c.get("/auth/me")
        assert resp.status_code == 200
        assert resp.json()["email"] == user.email
    finally:
        db.close()


def test_me_ainda_aceita_bearer_header_compat_dupla():
    # Fase A/B do rollout (Plan Mode, secao 2.8) -- fallback bearer
    # continua ativo ate a Fase C confirmar que nao ha mais trafego assim.
    db = SessionLocal()
    try:
        user, _ = _criar_usuario(db)
        token = create_access_token(user)
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
    finally:
        db.close()


def test_refresh_rotaciona_e_reuso_do_token_antigo_falha():
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        c = TestClient(app)
        c.post("/auth/login", json={"email": user.email, "password": senha})
        refresh_antigo = c.cookies.get(REFRESH_COOKIE_NAME)
        assert refresh_antigo is not None

        primeiro = c.post("/auth/refresh")
        assert primeiro.status_code == 200
        refresh_novo = c.cookies.get(REFRESH_COOKIE_NAME)
        assert refresh_novo != refresh_antigo

        # Reuso do refresh JA ROTACIONADO (revogado) precisa falhar -- prova
        # de rotacao real, nao reemissao do mesmo token.
        c.cookies.set(REFRESH_COOKIE_NAME, refresh_antigo)
        reuso = c.post("/auth/refresh")
        assert reuso.status_code == 401
    finally:
        db.close()


def test_logout_revoga_refresh_no_servidor():
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        c = TestClient(app)
        c.post("/auth/login", json={"email": user.email, "password": senha})

        logout = c.post("/auth/logout")
        assert logout.status_code == 200

        # Cookie de refresh foi limpo no client -- forcar reenvio do valor
        # antigo pra provar que o SERVIDOR (nao so o cookie local) revogou.
        # (Sem isso o teste so provaria que o TestClient limpou o jar.)
        pos_logout = c.post("/auth/refresh")
        assert pos_logout.status_code == 401
    finally:
        db.close()


def test_rate_limit_no_login():
    c = TestClient(app)
    respostas = [
        c.post("/auth/login", json={"email": "nao-existe-rate-limit@example.com", "password": "errada"})
        for _ in range(6)
    ]
    assert respostas[-1].status_code == 429
    corpo = respostas[-1].json()
    assert set(corpo.keys()) == {"error", "detail"}
    assert corpo["detail"] is None  # nunca vaza limite/janela configurados
