"""Sessão cookie HttpOnly + refresh rotativo -- Plan Mode segurança
2026-09-16, Bloco 2. Via `TestClient` real (não chamada direta de função):
o que se quer provar aqui é o comportamento HTTP observável (cookie
setado, rotação, revogação), que só aparece passando pela pilha real do
framework.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth import (
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    REFRESH_COOKIE_NAME,
    create_access_token,
    create_refresh_token,
    hash_password,
    rotate_refresh_token,
)
from app.db.base import SessionLocal
from app.db.models import User, UserRole
from app.main import app

client = TestClient(app)


def _criar_usuario(db, senha: str = "senha-teste-123") -> tuple[User, str]:
    user = User(
        name="Usuário Pytest Sessão",
        email=f"pytest-auth-session-{uuid4()}@example.com",
        password_hash=hash_password(senha),
        role=UserRole.colaborador,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, senha


def test_login_seta_cookies_de_acesso_refresh_e_csrf():
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        resp = client.post("/auth/login", json={"email": user.email, "password": senha})
        assert resp.status_code == 200
        # Bearer e access token não voltam no corpo. A cópia do CSRF é
        # proposital: Vercel não consegue ler o cookie que pertence ao Render.
        corpo = resp.json()
        assert corpo["status"] == "ok"
        assert corpo["csrf_token"] == client.cookies.get(CSRF_COOKIE_NAME)

        # `.items()` colapsa Set-Cookie duplicado numa unica string
        # separada por virgula -- usar `.get_list` pra manter os 3 cookies
        # separados (senao "HttpOnly" de outro cookie vaza pro assert).
        cookies_setados = [v.decode() for k, v in resp.headers.raw if k.decode().lower() == "set-cookie"]
        assert any(ACCESS_COOKIE_NAME in c and "HttpOnly" in c for c in cookies_setados)
        assert any(REFRESH_COOKIE_NAME in c and "HttpOnly" in c for c in cookies_setados)
        # Cookie CSRF (Bloco 1, double-submit) NAO e HttpOnly -- precisa ser
        # legivel por JS pra ir no header X-CSRF-Token.
        csrf_cookie = next(c for c in cookies_setados if CSRF_COOKIE_NAME in c)
        assert "HttpOnly" not in csrf_cookie
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


def test_me_nao_aceita_mais_bearer_header():
    # Bearer fallback removido em 2026-09-17 (Bloco 2 do Plan Mode
    # consolidacao) -- so cookie autentica agora.
    db = SessionLocal()
    try:
        user, _ = _criar_usuario(db)
        token = create_access_token(user, refresh_token_id=1)
        # Client novo, sem cookie de sessao na jar (o `client` module-level
        # ja tem cookie valido de outros testes deste arquivo).
        resp = TestClient(app).get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
    finally:
        db.close()


def test_ativacao_e_redefinicao_rejeitam_token_invalido_sem_expor_o_valor():
    """Os dois fluxos públicos precisam falhar igual para token inventado.

    Além do status de domínio, o contrato impede que o token recebido volte
    em ``detail`` — ele pode ter vindo de convite ou recuperação de senha.
    """
    from app.rate_limit import limiter

    for rota in ("/auth/ativar", "/auth/redefinir-senha"):
        limiter.reset()
        token = f"token-invalido-{uuid4()}"
        senha = f"senha-{uuid4()}"
        cliente = TestClient(app)
        cliente.cookies.set(CSRF_COOKIE_NAME, "csrf-contrato")
        resposta = cliente.post(
            rota,
            json={"token": token, "password": senha},
            headers={CSRF_HEADER_NAME: "csrf-contrato"},
        )

        assert resposta.status_code == 400
        assert token not in resposta.text
        assert "inválido ou expirado" in resposta.json()["error"].lower()
        assert resposta.json()["detail"] is None


def test_refresh_rotaciona_e_reuso_do_token_antigo_falha():
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        c = TestClient(app)
        c.post("/auth/login", json={"email": user.email, "password": senha})
        refresh_antigo = c.cookies.get(REFRESH_COOKIE_NAME)
        assert refresh_antigo is not None
        csrf = c.cookies.get(CSRF_COOKIE_NAME)
        assert csrf is not None

        primeiro = c.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf})
        assert primeiro.status_code == 200
        refresh_novo = c.cookies.get(REFRESH_COOKIE_NAME)
        assert refresh_novo != refresh_antigo

        # Reuso do refresh JA ROTACIONADO (revogado) precisa falhar -- prova
        # de rotacao real, nao reemissao do mesmo token.
        c.cookies.set(REFRESH_COOKIE_NAME, refresh_antigo)
        csrf_novo = c.cookies.get(CSRF_COOKIE_NAME)
        assert csrf_novo is not None
        reuso = c.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf_novo})
        assert reuso.status_code == 401
    finally:
        db.close()


def test_rotacao_concorrente_do_mesmo_token_so_uma_vence():
    """Plan Mode database 2026-09-17, Bloco 1: duas requisicoes concorrentes
    com o mesmo refresh token nao podiam gerar dois sucessores do mesmo
    token pai (`SELECT` + atribuicao + `commit()` deixava uma janela onde
    ambas passavam pela checagem `revoked_at is None` antes de qualquer
    commit). Cada thread abre sua propria `Session`/conexao -- e a garantia
    real que se quer provar (2 transacoes concorrentes no banco), uma
    unica `Session` compartilhada nao exerceria a race de verdade."""
    db_setup = SessionLocal()
    try:
        user = User(
            name="Usuário Pytest Rotacao Concorrente",
            email=f"pytest-auth-rotacao-{uuid4()}@example.com",
            password_hash=hash_password("senha-teste-123"),
            role=UserRole.colaborador,
        )
        db_setup.add(user)
        db_setup.commit()
        db_setup.refresh(user)

        db_token = SessionLocal()
        token, _ = create_refresh_token(db_token, user)
        db_token.commit()
        db_token.close()
    finally:
        db_setup.close()

    def tentar_rotacionar():
        db = SessionLocal()
        try:
            rotate_refresh_token(db, token)
            return "sucesso"
        except Exception:
            return "falhou"
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        resultados = list(executor.map(lambda _: tentar_rotacionar(), range(2)))

    assert sorted(resultados) == ["falhou", "sucesso"]


def test_logout_revoga_refresh_no_servidor():
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        c = TestClient(app)
        c.post("/auth/login", json={"email": user.email, "password": senha})
        csrf = c.cookies.get(CSRF_COOKIE_NAME)
        refresh_antigo = c.cookies.get(REFRESH_COOKIE_NAME)
        assert csrf is not None
        assert refresh_antigo is not None

        logout = c.post("/auth/logout", headers={CSRF_HEADER_NAME: csrf})
        assert logout.status_code == 200

        # Cookie de refresh foi limpo no client -- forcar reenvio do valor
        # antigo pra provar que o SERVIDOR (nao so o cookie local) revogou.
        # (Sem isso o teste so provaria que o TestClient limpou o jar.)
        c.cookies.set(REFRESH_COOKIE_NAME, refresh_antigo)
        c.cookies.set(CSRF_COOKIE_NAME, csrf)
        pos_logout = c.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf})
        assert pos_logout.status_code == 401
    finally:
        db.close()


def test_logout_invalida_imediatamente_access_cookie_reaproveitado():
    """O logout precisa invalidar a sessão inteira, não só o refresh.

    O navegador apaga o access cookie normalmente; aqui ele é recolocado de
    propósito para provar que uma cópia anterior não continua autorizando
    chamadas até o vencimento natural do JWT.
    """
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        c = TestClient(app)
        c.post("/auth/login", json={"email": user.email, "password": senha})
        csrf = c.cookies.get(CSRF_COOKIE_NAME)
        access_antigo = c.cookies.get(ACCESS_COOKIE_NAME)
        assert csrf is not None
        assert access_antigo is not None

        resposta_logout = c.post("/auth/logout", headers={CSRF_HEADER_NAME: csrf})
        assert resposta_logout.status_code == 200

        c.cookies.set(ACCESS_COOKIE_NAME, access_antigo)
        acesso_reaproveitado = c.get("/auth/me")
        assert acesso_reaproveitado.status_code == 401
    finally:
        db.close()


def test_rate_limit_no_login():
    from app.rate_limit import limiter

    c = TestClient(app)
    respostas = [
        c.post("/auth/login", json={"email": "nao-existe-rate-limit@example.com", "password": "errada"})
        for _ in range(6)
    ]
    assert respostas[-1].status_code == 429
    corpo = respostas[-1].json()
    assert set(corpo.keys()) == {"error", "detail"}
    assert corpo["detail"] is None  # nunca vaza limite/janela configurados

    # `limiter` e' in-memory/por-processo (ver docstring de rate_limit.py) --
    # sem reset, este teste esgota a janela de 5/min pra chave "testclient"
    # (mesma chave de TODO TestClient default) e qualquer login de outro
    # arquivo que rode depois, na mesma sessao do pytest, pega 429 por
    # tabela em vez do proprio comportamento sob teste (achado real ao
    # escrever test_csrf.py, Bloco 1 do Plan Mode consolidacao 2026-09-17).
    limiter.reset()
