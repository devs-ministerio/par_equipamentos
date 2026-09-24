"""Prova, via HTTP real (TestClient), a defesa CSRF double-submit -- Bloco
1 do Plan Mode consolidacao 2026-09-17 (backend/app/main.py::csrf_middleware).
Toda rota mutavel (POST/PUT/PATCH/DELETE) exige que o header `X-CSRF-Token`
bata com o cookie `sigeo_csrf`; sem isso (ou com valor divergente) e 403.
Cobre exatamente os dois casos que o Plan Mode aponta como hoje sem nenhuma
defesa (`/auth/refresh`/`/auth/logout`, POSTs sem corpo) mais uma rota PATCH
de monitoramento, pra provar que a cobertura nao e so das rotas de auth.

Cada teste faz 1 unico login -- `POST /auth/login` tem rate limit de 5/min
(chave por IP, `testclient` pra todo `TestClient` default, ver
rate_limit.py) compartilhado por TODO o processo pytest; `test_auth_session.
py::test_rate_limit_no_login` reseta o limiter no fim do proprio arquivo,
mas nada garante outro reset depois -- manter poucos logins por arquivo
evita depender de ordem de execucao entre modulos de teste.
"""
from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, hash_password
from app.db.base import SessionLocal
from app.db.models import User, UserRole
from app.main import app

NR_CONVENIO_SEED = "948686"  # unico instrumento seedado (scripts/seed_monitoramento.py)


def _logar_usuario_novo(role: UserRole = UserRole.colaborador) -> tuple[TestClient, str]:
    db = SessionLocal()
    try:
        senha = "senha-teste-123"
        user = User(
            name="Usuário Pytest CSRF",
            email=f"pytest-csrf-{uuid4()}@example.com",
            password_hash=hash_password(senha),
            role=role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        email = user.email
    finally:
        db.close()

    c = TestClient(app)
    resp = c.post("/auth/login", json={"email": email, "password": senha})
    assert resp.status_code == 200
    csrf = c.cookies.get(CSRF_COOKIE_NAME)
    assert csrf is not None
    return c, csrf


def test_refresh_exige_header_csrf_correto():
    c, csrf = _logar_usuario_novo()

    sem_header = c.post("/auth/refresh")
    assert sem_header.status_code == 403

    divergente = c.post("/auth/refresh", headers={CSRF_HEADER_NAME: "valor-que-nao-bate-com-o-cookie"})
    assert divergente.status_code == 403

    correto = c.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf})
    assert correto.status_code == 200


def test_logout_exige_header_csrf_correto():
    c, csrf = _logar_usuario_novo()

    sem_header = c.post("/auth/logout")
    assert sem_header.status_code == 403

    correto = c.post("/auth/logout", headers={CSRF_HEADER_NAME: csrf})
    assert correto.status_code == 200


def test_patch_monitoramento_exige_header_csrf_correto():
    c, csrf = _logar_usuario_novo()

    sem_header = c.patch(f"/monitoramento/instrumentos/{NR_CONVENIO_SEED}", json={})
    assert sem_header.status_code == 403

    correto = c.patch(
        f"/monitoramento/instrumentos/{NR_CONVENIO_SEED}",
        json={},
        headers={CSRF_HEADER_NAME: csrf},
    )
    assert correto.status_code == 200


def test_login_nao_exige_header_csrf():
    # /auth/login e isento de proposito -- ainda nao existe cookie de sessao
    # nesse ponto pra comparar (e' o proprio ato que os emite).
    c, _csrf = _logar_usuario_novo()
    assert c is not None  # login (dentro do helper) ja e a prova: sucedeu sem header CSRF
