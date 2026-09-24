"""Modulo de gestao de usuarios (Admin), 2026-09-17 -- Router -> Service ->
Repository, mesmo estilo de `test_auth_session.py`/`test_csrf.py` (via
`TestClient` real, comportamento HTTP observavel)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, REFRESH_COOKIE_NAME, hash_password
from app.db.base import SessionLocal
from app.db.models import User, UserRole
from app.domain_errors import NotFoundError, ValidationError
from app.email import montar_url_acesso
from app.main import app
from app.rate_limit import limiter
from app.schemas import UserCreateRequest
from app.services.usuarios import criar_usuario, reenviar_convite


def _criar_usuario(db, *, role: UserRole, senha: str = "senha-teste-123") -> tuple[User, str]:
    user = User(
        name=f"Usuário Pytest {role.value} {uuid4().hex[:6]}",
        email=f"pytest-usuarios-{uuid4()}@example.com",
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


def test_link_de_acesso_usa_fragmento_nunca_querystring(monkeypatch):
    monkeypatch.setattr("app.email.settings.app_public_url", "https://sigeo.example")
    url = montar_url_acesso(token="token-unico", caminho="/redefinir-senha")
    assert url == "https://sigeo.example/redefinir-senha#token=token-unico"
    assert "?token=" not in url


def _csrf_headers(c: TestClient) -> dict:
    return {CSRF_HEADER_NAME: c.cookies.get(CSRF_COOKIE_NAME)}


def test_listar_usuarios_admin_busca_e_filtro():
    db = SessionLocal()
    try:
        admin, senha_admin = _criar_usuario(db, role=UserRole.admin)
        alvo, _ = _criar_usuario(db, role=UserRole.colaborador)
        c = _cliente_logado(admin, senha_admin)

        resp = c.get("/usuarios", params={"busca": alvo.email})
        assert resp.status_code == 200
        corpo = resp.json()
        assert corpo["total"] == 1
        assert corpo["itens"][0]["email"] == alvo.email

        resp_role = c.get("/usuarios", params={"role": "leitor"})
        assert resp_role.status_code == 200
        assert all(item["role"] == "leitor" for item in resp_role.json()["itens"])
    finally:
        db.close()


def test_listar_usuarios_403_para_colaborador_e_leitor():
    db = SessionLocal()
    try:
        for role in (UserRole.colaborador, UserRole.leitor):
            user, senha = _criar_usuario(db, role=role)
            c = _cliente_logado(user, senha)
            resp = c.get("/usuarios")
            assert resp.status_code == 403
    finally:
        db.close()


def test_criar_usuario_email_duplicado_409():
    db = SessionLocal()
    try:
        admin, senha_admin = _criar_usuario(db, role=UserRole.admin)
        existente, _ = _criar_usuario(db, role=UserRole.colaborador)
        c = _cliente_logado(admin, senha_admin)

        resp = c.post(
            "/usuarios",
            json={"name": "Novo", "email": existente.email, "role": "colaborador", "password": "senha-nova-123"},
            headers=_csrf_headers(c),
        )
        assert resp.status_code == 409
    finally:
        db.close()


def test_criar_e_editar_usuario():
    db = SessionLocal()
    try:
        admin, senha_admin = _criar_usuario(db, role=UserRole.admin)
        c = _cliente_logado(admin, senha_admin)

        criacao = c.post(
            "/usuarios",
            json={
                "name": "Fulano Pytest",
                "email": f"pytest-criado-{uuid4()}@example.com",
                "role": "colaborador",
                "password": "senha-criada-123",
            },
            headers=_csrf_headers(c),
        )
        assert criacao.status_code == 201
        criado_id = criacao.json()["id"]
        assert criacao.json()["role"] == "colaborador"

        edicao = c.patch(
            f"/usuarios/{criado_id}",
            json={"name": "Fulano Editado", "role": "leitor"},
            headers=_csrf_headers(c),
        )
        assert edicao.status_code == 200
        assert edicao.json()["name"] == "Fulano Editado"
        assert edicao.json()["role"] == "leitor"
    finally:
        db.close()


def test_admin_envia_redefinicao_sem_devolver_senha(monkeypatch):
    db = SessionLocal()
    try:
        admin, senha_admin = _criar_usuario(db, role=UserRole.admin)
        alvo, _senha_antiga = _criar_usuario(db, role=UserRole.colaborador)
        c = _cliente_logado(admin, senha_admin)
        monkeypatch.setattr("app.services.usuarios.settings.mail_api_url", "https://mail.test/send")
        monkeypatch.setattr("app.services.usuarios.settings.mail_api_secret", "secret-test")
        enviados = []
        monkeypatch.setattr("app.services.usuarios.enviar_link", lambda **kwargs: enviados.append(kwargs))

        resp = c.post(f"/usuarios/{alvo.id}/enviar-redefinicao", headers=_csrf_headers(c))
        assert resp.status_code == 200
        assert "senha" not in resp.text.lower()
        assert enviados
        db.refresh(alvo)
        assert alvo.activation_token_hash is not None
    finally:
        db.close()


def test_inativar_usuario_revoga_sessao_e_bloqueia_login():
    db = SessionLocal()
    try:
        admin, senha_admin = _criar_usuario(db, role=UserRole.admin)
        alvo, senha_alvo = _criar_usuario(db, role=UserRole.colaborador)

        sessao_alvo = _cliente_logado(alvo, senha_alvo)
        refresh_alvo = sessao_alvo.cookies.get(REFRESH_COOKIE_NAME)
        csrf_alvo = sessao_alvo.cookies.get(CSRF_COOKIE_NAME)
        assert refresh_alvo is not None
        assert csrf_alvo is not None

        c_admin = _cliente_logado(admin, senha_admin)
        resp = c_admin.post(f"/usuarios/{alvo.id}/inativar", headers=_csrf_headers(c_admin))
        assert resp.status_code == 200
        assert resp.json()["status"] == "inactive"

        # Sessao ja aberta antes da inativacao precisa parar de funcionar --
        # refresh do token antigo tem que falhar (revogado em lote).
        sessao_alvo.cookies.set(REFRESH_COOKIE_NAME, refresh_alvo)
        pos_inativacao = sessao_alvo.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf_alvo})
        assert pos_inativacao.status_code == 401

        limiter.reset()
        login_pos_inativacao = TestClient(app).post("/auth/login", json={"email": alvo.email, "password": senha_alvo})
        assert login_pos_inativacao.status_code == 401

        reativacao = c_admin.post(f"/usuarios/{alvo.id}/reativar", headers=_csrf_headers(c_admin))
        assert reativacao.status_code == 200
        assert reativacao.json()["status"] == "active"
    finally:
        db.close()


def test_admin_nao_pode_se_autorrebaixar_nem_se_autoinativar():
    db = SessionLocal()
    try:
        admin, senha_admin = _criar_usuario(db, role=UserRole.admin)
        c = _cliente_logado(admin, senha_admin)

        rebaixar = c.patch(
            f"/usuarios/{admin.id}", json={"name": admin.name, "role": "colaborador"}, headers=_csrf_headers(c)
        )
        assert rebaixar.status_code == 422

        inativar = c.post(f"/usuarios/{admin.id}/inativar", headers=_csrf_headers(c))
        assert inativar.status_code == 422
    finally:
        db.close()


def test_criacao_sem_senha_exige_servico_de_email_configurado(monkeypatch):
    db = SessionLocal()
    try:
        admin, _ = _criar_usuario(db, role=UserRole.admin)
        monkeypatch.setattr("app.services.usuarios.settings.mail_api_url", None)
        monkeypatch.setattr("app.services.usuarios.settings.mail_api_secret", None)

        with pytest.raises(ValidationError, match="e-mail não configurado"):
            criar_usuario(
                db=db,
                admin_atual=admin,
                dados=UserCreateRequest(
                    name="Convite", email=f"pytest-convite-{uuid4()}@example.com", role=UserRole.leitor
                ),
            )
    finally:
        db.rollback()
        db.close()


def test_convite_cria_token_auditavel_e_reenvio_trata_destinatario_inexistente(monkeypatch):
    db = SessionLocal()
    try:
        admin, _ = _criar_usuario(db, role=UserRole.admin)
        monkeypatch.setattr("app.services.usuarios.settings.mail_api_url", "https://mail.test/send")
        monkeypatch.setattr("app.services.usuarios.settings.mail_api_secret", "secret-test")
        enviados = []
        monkeypatch.setattr("app.services.usuarios.enviar_link", lambda **kwargs: enviados.append(kwargs))

        usuario = criar_usuario(
            db=db,
            admin_atual=admin,
            dados=UserCreateRequest(
                name="Convite", email=f"PYTEST-CONVITE-{uuid4()}@EXAMPLE.COM", role=UserRole.leitor
            ),
        )

        assert usuario.email == usuario.email.lower()
        assert usuario.activation_token_hash is not None
        assert enviados[0]["caminho"] == "/ativar"
        assert reenviar_convite(db=db, admin_atual=admin, user_id=usuario.id).id == usuario.id
        with pytest.raises(NotFoundError):
            reenviar_convite(db=db, admin_atual=admin, user_id=-1)
    finally:
        db.rollback()
        db.close()


def test_bloqueio_de_conta_apos_10_falhas_seguidas():
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db, role=UserRole.colaborador)

        for _ in range(10):
            limiter.reset()
            resp = TestClient(app).post("/auth/login", json={"email": user.email, "password": "senha-errada"})
            assert resp.status_code == 401

        limiter.reset()
        login_com_senha_certa = TestClient(app).post("/auth/login", json={"email": user.email, "password": senha})
        assert login_com_senha_certa.status_code == 401  # conta bloqueada, mesmo com senha correta

        db.refresh(user)
        assert user.locked_until is not None
    finally:
        db.close()
