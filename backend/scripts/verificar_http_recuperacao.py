"""Aceite HTTP manual: servidores locais já iniciados; nenhuma API externa.

Execute com --env <arquivo privado>. Os quatro casos abaixo não integram a
coleta padrão de CI: usam localhost e credenciais sintéticas explícitas.
O navegador admin é verificado pelos E2E existentes. Cada rodada faz três
logins e respeita o limite normal da aplicação (não desativa rate limiting).
"""

import argparse
import os
import time
from pathlib import Path

import httpx
import pytest
from dotenv import dotenv_values

from scripts.servir_local_recuperacao import conferir_ambiente_servido


@pytest.fixture(scope="module")
def ambiente_local() -> dict[str, str]:
    privado = Path(os.environ["SIGEO_LOCAL_VERIFICATION_ENV"])
    if privado.is_symlink() or privado.stat().st_mode & 0o777 != 0o600:
        raise ValueError("Aceite exige arquivo privado 0600, sem symlink.")
    ambiente = {chave: valor for chave, valor in dotenv_values(privado).items() if valor is not None}
    conferir_ambiente_servido(ambiente)
    return ambiente


def test_saude_cors_e_caixa_sem_transporte_externo(ambiente_local: dict[str, str]) -> None:
    with httpx.Client(base_url="http://127.0.0.1:8001", trust_env=False, timeout=20) as cliente:
        resposta = cliente.get("/health")
        assert resposta.status_code == 200
        assert resposta.json() == {"status": "ok", "database": "connected"}
        assert cliente.get("/auth/me").status_code == 401
        cors = cliente.options(
            "/auth/refresh",
            headers={
                "Origin": "http://127.0.0.1:5181",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "X-CSRF-Token",
            },
        )
        assert cors.status_code == 200
        assert cors.headers["access-control-allow-origin"] == "http://127.0.0.1:5181"
        assert cors.headers["access-control-allow-credentials"] == "true"
    with httpx.Client(base_url="http://127.0.0.1:8002", trust_env=False, timeout=10) as caixa:
        assert caixa.get("/mensagens").status_code == 401
        headers = {"x-api-key": ambiente_local["MAIL_API_SECRET"]}
        mensagem = {
            "to": "verificacao@example.com",
            "subject": "Verificação local",
            "fromName": "SISGEO local",
            "html": "<p>Mensagem sintética de verificação, sem token.</p>",
        }
        assert caixa.post("/enviar", json=mensagem, headers=headers).status_code == 200
        conteudo = caixa.get("/mensagens", headers=headers)
        assert conteudo.status_code == 200
        assert mensagem in conteudo.json()["mensagens"]
        mensagem["to"] = "bloqueado@saude.gov.br"
        assert caixa.post("/enviar", json=mensagem, headers=headers).status_code == 422


@pytest.mark.parametrize("papel", ["gestor", "colaborador", "leitor"])
def test_perfis_sessao_60_minutos_csrf_rotacao_e_logout(ambiente_local: dict[str, str], papel: str) -> None:
    with httpx.Client(base_url="http://127.0.0.1:8001", trust_env=False, timeout=20) as cliente:
        login = cliente.post(
            "/auth/login",
            json={
                "email": papel + ".homologacao@example.com",
                "password": ambiente_local["SIGEO_LOCAL_" + papel.upper() + "_PASSWORD"],
            },
        )
        assert login.status_code == 200
        identidade = cliente.get("/auth/me")
        assert identidade.status_code == 200
        assert identidade.json()["role"] == papel
        cookie = next(c for c in cliente.cookies.jar if c.name == "sigeo_access")
        assert cookie.expires is not None
        validade = int(cookie.expires) - int(time.time())
        assert 3580 <= validade <= 3605
        http_only = cookie.has_nonstandard_attr("HttpOnly")
        assert http_only is True
        assert cliente.get("/usuarios", params={"limit": 1}).status_code == 403
        assert cliente.get("/notificacoes").status_code == 200
        assert cliente.get("/candidatos-legados").status_code == 200
        assert cliente.post("/auth/refresh").status_code == 403
        anterior = cliente.cookies.get("sigeo_refresh")
        csrf = cliente.cookies.get("sigeo_csrf")
        assert csrf is not None
        renovacao = cliente.post("/auth/refresh", headers={"X-CSRF-Token": csrf})
        assert renovacao.status_code == 200
        rotacionou = bool(anterior and cliente.cookies.get("sigeo_refresh") != anterior)
        assert rotacionou is True
        csrf = cliente.cookies.get("sigeo_csrf")
        assert csrf is not None
        assert cliente.post("/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 200
        assert cliente.get("/auth/me").status_code == 401


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, required=True)
    args = parser.parse_args()
    os.environ["SIGEO_LOCAL_VERIFICATION_ENV"] = str(args.env)
    raise SystemExit(
        pytest.main([str(Path(__file__).resolve()), "-q", "--tb=short", "--show-capture=no", "-o", "addopts="])
    )


if __name__ == "__main__":
    main()
