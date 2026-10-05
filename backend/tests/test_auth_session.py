"""Sessão cookie HttpOnly + refresh rotativo -- Plan Mode segurança
2026-09-16, Bloco 2. Via `TestClient` real (não chamada direta de função):
o que se quer provar aqui é o comportamento HTTP observável (cookie
setado, rotação, revogação), que só aparece passando pela pilha real do
framework.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import update

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
from app.db.models import AuditLog, RefreshToken, User, UserRole
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


def test_fluxos_publicos_de_acesso_nao_exigem_csrf_e_nao_expoem_token_invalido():
    """Fluxos sem sessão não podem depender de um cookie CSRF inexistente.

    Ativação/redefinição se protegem pelo token opaco, de uso único e
    expirável; além de alcançar o erro de domínio, o contrato impede que o
    token recebido volte em ``detail``. Recuperação continua genérica para
    não revelar se o e-mail está cadastrado.
    """
    from app.rate_limit import limiter

    for rota in ("/auth/ativar", "/auth/redefinir-senha"):
        limiter.reset()
        token = f"token-invalido-{uuid4()}"
        senha = f"senha-{uuid4()}"
        cliente = TestClient(app)
        resposta = cliente.post(rota, json={"token": token, "password": senha})

        assert resposta.status_code == 400
        assert token not in resposta.text
        assert "inválido ou expirado" in resposta.json()["error"].lower()
        assert resposta.json()["detail"] is None

    limiter.reset()
    recuperacao = TestClient(app).post("/auth/esqueci-senha", json={"email": "ausente@example.com"})
    assert recuperacao.status_code == 200
    assert recuperacao.json() == {"status": "ok"}


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


def test_rotacao_falha_apos_timeout_de_inatividade():
    """2026-10-05: achado real -- sem idle timeout, abrir o app 1x a cada
    `refresh_token_expire_days` (14) nunca deslogava. `last_used_at` velho
    (simula sessão sem nenhuma chamada há mais que `refresh_idle_timeout_
    minutes`) precisa derrubar a rotação mesmo com `expires_at`/teto
    absoluto ainda longe no futuro."""
    db = SessionLocal()
    try:
        user, _ = _criar_usuario(db)
        token, sessao_id = create_refresh_token(db, user)
        db.commit()
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == sessao_id)
            .values(last_used_at=datetime.now(timezone.utc) - timedelta(hours=3))
        )
        db.commit()

        with pytest.raises(HTTPException) as excinfo:
            rotate_refresh_token(db, token)
        assert excinfo.value.status_code == 401
    finally:
        db.close()


def test_rotacao_falha_apos_teto_absoluto_mesmo_com_uso_continuo():
    """`session_started_at` nunca é resetado entre rotações -- uso contínuo
    (`last_used_at` recente a cada chamada) não deve bastar pra sustentar a
    sessão além do teto absoluto (`refresh_absolute_timeout_minutes`)."""
    db = SessionLocal()
    try:
        user, _ = _criar_usuario(db)
        token, sessao_id = create_refresh_token(db, user)
        db.commit()
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == sessao_id)
            .values(session_started_at=datetime.now(timezone.utc) - timedelta(days=2))
        )
        db.commit()

        with pytest.raises(HTTPException) as excinfo:
            rotate_refresh_token(db, token)
        assert excinfo.value.status_code == 401
    finally:
        db.close()


def test_rotacao_propaga_session_started_at_pela_cadeia():
    """A cadeia de rotações precisa herdar o início original -- se cada
    rotação resetasse `session_started_at`, o teto absoluto nunca venceria
    com uso contínuo (o mesmo bug de fundo que motivou este campo)."""
    db = SessionLocal()
    try:
        user, _ = _criar_usuario(db)
        token, sessao_id = create_refresh_token(db, user)
        db.commit()
        inicio_original = datetime.now(timezone.utc) - timedelta(hours=1)
        db.execute(
            update(RefreshToken).where(RefreshToken.id == sessao_id).values(session_started_at=inicio_original)
        )
        db.commit()

        _, _, nova_sessao_id = rotate_refresh_token(db, token)

        nova_sessao = db.get(RefreshToken, nova_sessao_id)
        assert nova_sessao is not None
        assert abs((nova_sessao.session_started_at - inicio_original).total_seconds()) < 1
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


def _acoes_auditoria(db, *, entity_id: int) -> list[str]:
    linhas = (
        db.query(AuditLog)
        .filter(AuditLog.entity_name == "auth", AuditLog.entity_id == entity_id)
        .order_by(AuditLog.id)
        .all()
    )
    return [linha.action for linha in linhas]


def test_login_sucesso_e_falha_geram_auditoria():
    from app.rate_limit import limiter

    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        c = TestClient(app)

        limiter.reset()
        falha = c.post("/auth/login", json={"email": user.email, "password": "senha-errada"})
        assert falha.status_code == 401
        sucesso = c.post("/auth/login", json={"email": user.email, "password": senha})
        assert sucesso.status_code == 200

        assert _acoes_auditoria(db, entity_id=user.id) == ["login_falha", "login_sucesso"]
    finally:
        db.close()


def test_ativacao_e_logout_geram_auditoria():
    from app.rate_limit import limiter

    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        c = TestClient(app)
        limiter.reset()
        c.post("/auth/login", json={"email": user.email, "password": senha})
        csrf = c.cookies.get(CSRF_COOKIE_NAME)
        assert csrf is not None

        logout = c.post("/auth/logout", headers={CSRF_HEADER_NAME: csrf})
        assert logout.status_code == 200

        assert _acoes_auditoria(db, entity_id=user.id) == ["login_sucesso", "logout"]
    finally:
        db.close()


def test_reuso_de_refresh_ja_revogado_gera_auditoria():
    from app.rate_limit import limiter

    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        c = TestClient(app)
        limiter.reset()
        c.post("/auth/login", json={"email": user.email, "password": senha})
        refresh_antigo = c.cookies.get(REFRESH_COOKIE_NAME)
        csrf = c.cookies.get(CSRF_COOKIE_NAME)
        assert refresh_antigo is not None
        assert csrf is not None

        c.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf})
        # O CSRF cookie roda a cada /auth/refresh (mesmo set_session_cookies
        # do /auth/login) -- reusar o valor antigo aqui daria 403 de CSRF
        # em vez do 401 de reuso que este teste quer provar.
        csrf_atual = c.cookies.get(CSRF_COOKIE_NAME)
        assert csrf_atual is not None
        c.cookies.set(REFRESH_COOKIE_NAME, refresh_antigo)
        reuso = c.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf_atual})
        assert reuso.status_code == 401

        assert "refresh_reuso_detectado" in _acoes_auditoria(db, entity_id=user.id)
    finally:
        db.close()


def test_reuso_de_refresh_derruba_todas_as_sessoes_do_usuario():
    """Correção 2026-09-30: quem renovou primeiro com o token copiado (às
    vezes o invasor) seguia logado depois do reuso ser detectado. Agora o
    reuso revoga TODAS as sessões do usuário -- inclusive a do outro lado."""
    from app.rate_limit import limiter

    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        limiter.reset()
        vitima = TestClient(app)
        vitima.post("/auth/login", json={"email": user.email, "password": senha})
        copiado = vitima.cookies.get(REFRESH_COOKIE_NAME)
        csrf = vitima.cookies.get(CSRF_COOKIE_NAME)
        assert copiado is not None and csrf is not None

        invasor = TestClient(app)
        invasor.cookies.set(REFRESH_COOKIE_NAME, copiado)
        invasor.cookies.set(CSRF_COOKIE_NAME, csrf)
        renovou = invasor.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf})
        assert renovou.status_code == 200
        assert invasor.get("/auth/me").status_code == 200

        reuso = vitima.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf})
        assert reuso.status_code == 401

        # A sessão que o invasor obteve cai imediatamente (access e refresh).
        assert invasor.get("/auth/me").status_code == 401
        csrf_invasor = renovou.json()["csrf_token"]
        assert invasor.post("/auth/refresh", headers={CSRF_HEADER_NAME: csrf_invasor}).status_code == 401
    finally:
        db.close()


def _configurar_email(monkeypatch, *, falhar: bool = False) -> list[str]:
    from app.config import settings
    from app.routers import auth as auth_router

    monkeypatch.setattr(settings, "mail_api_url", "https://gateway.example.test/enviar")
    monkeypatch.setattr(settings, "mail_api_secret", "segredo-teste")
    enviados: list[str] = []

    def _falso_enviar(*, destinatario, **_kwargs):
        if falhar:
            raise RuntimeError("gateway fora do ar")
        enviados.append(destinatario)

    monkeypatch.setattr(auth_router, "enviar_link", _falso_enviar)
    return enviados


def test_esqueci_senha_nao_bloqueia_login_com_a_senha_atual(monkeypatch):
    """Correção 2026-09-30: pedir recuperação (qualquer pessoa, só com o
    e-mail) trancava o login do usuário por 7 dias."""
    from app.rate_limit import limiter

    enviados = _configurar_email(monkeypatch)
    db = SessionLocal()
    try:
        user, senha = _criar_usuario(db)
        limiter.reset()
        pedido = TestClient(app).post("/auth/esqueci-senha", json={"email": user.email})
        assert pedido.status_code == 200
        assert enviados == [user.email]
        db.refresh(user)
        assert user.activation_token_hash is not None  # link continua válido

        login = TestClient(app).post("/auth/login", json={"email": user.email, "password": senha})
        assert login.status_code == 200
    finally:
        db.close()


def test_esqueci_senha_com_falha_no_email_nao_grava_token(monkeypatch):
    """Correção 2026-09-30: o rollback vinha depois do commit, e o token
    ficava gravado sem o e-mail ter saído."""
    from app.rate_limit import limiter

    _configurar_email(monkeypatch, falhar=True)
    db = SessionLocal()
    try:
        user, _ = _criar_usuario(db)
        limiter.reset()
        pedido = TestClient(app).post("/auth/esqueci-senha", json={"email": user.email})
        assert pedido.status_code == 200  # resposta genérica, sem revelar falha
        db.refresh(user)
        assert user.activation_token_hash is None
        assert user.activation_expires_at is None
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
