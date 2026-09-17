"""Prova, via HTTP real (TestClient), que as leituras de monitoramento e de
propostas candidatas exigem sessão -- Plan Mode segurança 2026-09-16, Bloco
1. Diferente do padrão do resto de `test_monitoramento.py`/
`test_propostas_candidatas.py` (chamada direta da função do router, sem
passar pelo `Depends` do FastAPI): aqui o que se quer provar é justamente o
comportamento HTTP (401 sem token), que só aparece passando pela pilha real
do framework -- mesmo padrão já usado em `test_municipality_coverage.py`/
`test_equipment_totals.py`.
"""
from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.db.base import SessionLocal
from app.db.models import User, UserRole
from app.main import app

client = TestClient(app)

NR_CONVENIO_SEED = "948686"  # unico instrumento seedado (scripts/seed_monitoramento.py)

ROTAS_PROTEGIDAS_GET = [
    "/monitoramento/cnes-referencia?q=ab",
    "/monitoramento/instrumentos",
    f"/monitoramento/instrumentos/{NR_CONVENIO_SEED}",
    "/monitoramento/resumo",
    "/monitoramento/acoes",
    "/propostas-candidatas",
]


def _token_usuario_teste(db, role: UserRole = UserRole.colaborador) -> str:
    user = User(
        name="Usuário Pytest Auth",
        email=f"pytest-monitoramento-auth-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        cpf_hash="cpf-pytest",
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return create_access_token(user)


def test_leituras_de_monitoramento_exigem_token():
    for rota in ROTAS_PROTEGIDAS_GET:
        resp = client.get(rota)
        assert resp.status_code == 401, f"{rota} deveria exigir token (Plan Mode segurança Bloco 1)"


def test_leituras_de_monitoramento_aceitam_token_valido():
    db = SessionLocal()
    try:
        token = _token_usuario_teste(db)
        headers = {"Authorization": f"Bearer {token}"}
        for rota in ROTAS_PROTEGIDAS_GET:
            resp = client.get(rota, headers=headers)
            assert resp.status_code == 200, f"{rota} deveria aceitar token válido, veio {resp.status_code}: {resp.text}"
    finally:
        db.close()


def test_marcos_continua_publico_por_decisao_explicita():
    # /monitoramento/marcos e a excecao deliberada do Bloco 1 (catalogo
    # fixo, sem dado interno) -- prova que a decisao nao virou omissao.
    resp = client.get("/monitoramento/marcos")
    assert resp.status_code == 200


def test_erro_de_validacao_nao_ecoa_payload_enviado():
    # Regressao do achado P0 "validacao reflete conteudo sensivel" (Plan
    # Mode seguranca, Bloco 1): um payload invalido de /auth/login nao pode
    # devolver a senha enviada em detail[].input.
    resp = client.post("/auth/login", json={"email": "nao-e-email", "password": 123})
    assert resp.status_code == 422
    corpo = resp.json()
    for erro in corpo["detail"]:
        assert set(erro.keys()) == {"loc", "msg", "type"}
        assert "input" not in erro
        assert "ctx" not in erro
