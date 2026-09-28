"""Trilha de auditoria (Módulo de Auditoria, 2026-09-28) -- Router -> Service
-> Repository, mesmo estilo de `test_usuarios.py` (via `TestClient` real)."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, hash_password
from app.db.base import SessionLocal
from app.db.models import User, UserRole
from app.main import app
from app.rate_limit import limiter


def _criar_usuario(db, *, role: UserRole, senha: str = "senha-teste-123") -> tuple[User, str]:
    user = User(
        name=f"Usuário Pytest Auditoria {role.value} {uuid4().hex[:6]}",
        email=f"pytest-auditoria-{uuid4()}@example.com",
        password_hash=hash_password(senha),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, senha


def _cliente_logado(user: User, senha: str) -> TestClient:
    c = TestClient(app)
    limiter.reset()
    resp = c.post("/auth/login", json={"email": user.email, "password": senha})
    assert resp.status_code == 200
    return c


def _csrf_headers(c: TestClient) -> dict:
    return {CSRF_HEADER_NAME: c.cookies.get(CSRF_COOKIE_NAME)}


def test_listar_auditoria_403_para_nao_admin():
    db = SessionLocal()
    try:
        for role in (UserRole.colaborador, UserRole.gestor, UserRole.leitor):
            user, senha = _criar_usuario(db, role=role)
            c = _cliente_logado(user, senha)
            resp = c.get("/auditoria")
            assert resp.status_code == 403
    finally:
        db.close()


def test_login_do_admin_ja_aparece_na_propria_listagem():
    """O próprio login que autentica o admin já gera uma linha `auth` --
    confirma que a leitura enxerga o que o Módulo de Auditoria acabou de
    escrever, sem depender de nenhum outro consumidor ter rodado antes."""
    db = SessionLocal()
    try:
        admin, senha_admin = _criar_usuario(db, role=UserRole.admin)
        c = _cliente_logado(admin, senha_admin)

        resp = c.get("/auditoria", params={"entity_name": "auth", "user_id": admin.id})
        assert resp.status_code == 200
        corpo = resp.json()
        assert corpo["total"] >= 1
        acoes = [item["action"] for item in corpo["itens"]]
        assert "login_sucesso" in acoes
        item = next(i for i in corpo["itens"] if i["action"] == "login_sucesso")
        assert item["usuario_email"] == admin.email
    finally:
        db.close()


def test_criar_usuario_gera_linha_de_auditoria_visivel_na_listagem():
    db = SessionLocal()
    try:
        admin, senha_admin = _criar_usuario(db, role=UserRole.admin)
        c = _cliente_logado(admin, senha_admin)

        criacao = c.post(
            "/usuarios",
            json={
                "name": "Auditado Pytest",
                "email": f"pytest-auditado-{uuid4()}@example.com",
                "role": "colaborador",
                "password": "senha-criada-123",
            },
            headers=_csrf_headers(c),
        )
        assert criacao.status_code == 201
        criado_id = criacao.json()["id"]

        resp = c.get("/auditoria", params={"entity_name": "user", "action": "criar_usuario", "user_id": admin.id})
        assert resp.status_code == 200
        corpo = resp.json()
        assert any(item["entity_id"] == criado_id for item in corpo["itens"])
    finally:
        db.close()


def test_listar_auditoria_respeita_limit():
    db = SessionLocal()
    try:
        admin, senha_admin = _criar_usuario(db, role=UserRole.admin)
        c = _cliente_logado(admin, senha_admin)

        resp = c.get("/auditoria", params={"limit": 1})
        assert resp.status_code == 200
        assert len(resp.json()["itens"]) <= 1
    finally:
        db.close()
