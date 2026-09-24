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

from app.auth import ACCESS_COOKIE_NAME, create_access_token, create_refresh_token, hash_password
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
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _, refresh_token_id = create_refresh_token(db, user)
    db.commit()
    return create_access_token(user, refresh_token_id)


def test_leituras_de_monitoramento_exigem_token():
    for rota in ROTAS_PROTEGIDAS_GET:
        resp = client.get(rota)
        assert resp.status_code == 401, f"{rota} deveria exigir token (Plan Mode segurança Bloco 1)"


def test_leituras_de_monitoramento_aceitam_token_valido():
    db = SessionLocal()
    try:
        token = _token_usuario_teste(db)
        headers = {"Cookie": f"{ACCESS_COOKIE_NAME}={token}"}
        for rota in ROTAS_PROTEGIDAS_GET:
            resp = client.get(rota, headers=headers)
            assert resp.status_code == 200, f"{rota} deveria aceitar token válido, veio {resp.status_code}: {resp.text}"
    finally:
        db.close()


def test_busca_cnes_expoe_apenas_campos_do_autocomplete_e_valida_termo():
    db = SessionLocal()
    try:
        token = _token_usuario_teste(db)
        headers = {"Cookie": f"{ACCESS_COOKIE_NAME}={token}"}

        resposta = client.get("/monitoramento/cnes-referencia", params={"q": "ab"}, headers=headers)
        assert resposta.status_code == 200
        assert len(resposta.json()) <= 20
        for item in resposta.json():
            assert set(item) == {"cnes", "nome_estabelecimento", "municipio", "uf"}

        invalida = client.get("/monitoramento/cnes-referencia", params={"q": "x"}, headers=headers)
        assert invalida.status_code == 422
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
