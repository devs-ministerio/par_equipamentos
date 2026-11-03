"""Limite de requisições nas rotas pesadas e validação do gateway de e-mail (sem banco)."""

from __future__ import annotations

import pytest
from starlette.requests import Request

from app.config import Settings
from app.rate_limit import chave_por_sessao, limiter

_BASE = {"database_url": "postgresql://u@localhost/x", "jwt_secret": "x" * 40}


def _requisicao(cookie: str | None = None) -> Request:
    cabecalhos = [(b"cookie", f"sigeo_access={cookie}".encode())] if cookie else []
    return Request({"type": "http", "headers": cabecalhos, "client": ("203.0.113.9", 1), "method": "GET", "path": "/"})


@pytest.mark.parametrize(
    "rota",
    [
        "app.routers.relatorios.gerar_relatorio",
        "app.routers.usuarios.enviar_redefinicao",
        "app.routers.usuarios.reenviar",
    ],
)
def test_rotas_pesadas_tem_limite_registrado(rota):
    # Given / When
    import app.main  # noqa: F401  (registra os routers)

    # Then
    assert rota in limiter._route_limits


def test_chave_por_sessao_separa_usuarios_atras_do_mesmo_ip():
    # Given: dois usuários com o mesmo IP de origem (proxy)
    a, b, anonimo = _requisicao("token-a"), _requisicao("token-b"), _requisicao()
    # Then
    assert chave_por_sessao(a) != chave_por_sessao(b)
    assert chave_por_sessao(a) == chave_por_sessao(_requisicao("token-a"))
    assert "token-a" not in chave_por_sessao(a)
    assert chave_por_sessao(anonimo) == "203.0.113.9"


@pytest.mark.parametrize("url", ["", "https://mail.exemplo.gov.br/send", "http://localhost:9000/send"])
def test_mail_api_url_valida_aceita(url):
    assert Settings(**_BASE, mail_api_url=url).mail_api_url == url


def test_mail_api_url_http_fora_de_localhost_derruba_o_boot():
    with pytest.raises(ValueError, match="https"):
        Settings(**_BASE, mail_api_url="http://mail.exemplo.gov.br/send")
