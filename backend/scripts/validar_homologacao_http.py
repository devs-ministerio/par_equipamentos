"""Convite → caixa local → senha → login → renovação → redefinição, HTTP real.

Só executa no clone loopback validado. Tokens/senhas nunca são impressos.
"""

import argparse
import json
import re
import secrets
from html import unescape
from pathlib import Path
from uuid import uuid4

import requests

from scripts.homologacao_local import carregar_ambiente

BASE = "http://127.0.0.1:8001"


def confirmar(resposta: requests.Response, esperado: int, etapa: str) -> None:
    if resposta.status_code != esperado:
        raise RuntimeError(f"{etapa}: HTTP {resposta.status_code}, esperado {esperado}")
    print(etapa + ": OK", flush=True)


def login(conta: str, senha: str) -> requests.Session:
    cliente = requests.Session()
    resposta = cliente.post(BASE + "/auth/login", json={"email": conta, "password": senha}, timeout=15)
    confirmar(resposta, 200, "Login")
    cliente.headers["X-CSRF-Token"] = resposta.json()["csrf_token"]
    return cliente


def token_da_caixa(ambiente: dict[str, str], email: str) -> str:
    resposta = requests.get(
        "http://127.0.0.1:8002/mensagens", headers={"x-api-key": ambiente["MAIL_API_SECRET"]}, timeout=15
    )
    confirmar(resposta, 200, "Consulta autenticada da caixa local")
    mensagens = [m for m in resposta.json()["mensagens"] if m["to"] == email]
    if not mensagens:
        raise RuntimeError("Convite não foi capturado na caixa local.")
    token = re.search(r"#token=([^\"<>\s]+)", mensagens[-1]["html"])
    if token is None:
        raise RuntimeError("Mensagem sem link de acesso.")
    return unescape(token[1])


def validar(path: Path) -> None:
    ambiente = carregar_ambiente(path)
    contas = json.loads((path.parent / "contas-locais.json").read_text())
    confirmar(requests.get(BASE + "/health", timeout=15), 200, "Saúde do backend")
    admin = login("admin.homologacao@example.com", contas["admin.homologacao@example.com"])
    for rota in (
        "/auth/me",
        "/convenios?limit=5",
        "/monitoramento/instrumentos",
        "/monitoramento/resumo",
        "/propostas-candidatas?limit=5",
        "/candidatos-legados?limit=5",
    ):
        confirmar(admin.get(BASE + rota, timeout=30), 200, "Consulta " + rota.split("?")[0])
    leitor = login("leitor.homologacao@example.com", contas["leitor.homologacao@example.com"])
    confirmar(leitor.get(BASE + "/usuarios", timeout=15), 403, "Leitor não administra usuários")
    email = f"fluxo-{uuid4().hex}@example.com"
    confirmar(
        admin.post(
            BASE + "/usuarios",
            json={"name": "Homologação fluxo de convite", "email": email, "role": "colaborador"},
            timeout=20,
        ),
        201,
        "Convite por HTTP",
    )
    token = token_da_caixa(ambiente, email)
    senha = secrets.token_urlsafe(24)
    confirmar(
        requests.post(BASE + "/auth/ativar", json={"token": token, "password": senha}, timeout=15),
        200,
        "Cadastro de senha",
    )
    confirmar(
        requests.post(BASE + "/auth/ativar", json={"token": token, "password": senha}, timeout=15),
        400,
        "Convite de uso único",
    )
    usuario = login(email, senha)
    confirmar(usuario.get(BASE + "/auth/me", timeout=15), 200, "Primeiro acesso autenticado")
    anterior = usuario.cookies.get("sigeo_refresh")
    resposta = usuario.post(BASE + "/auth/refresh", timeout=15)
    confirmar(resposta, 200, "Renovação da sessão")
    if not usuario.cookies.get("sigeo_refresh") or usuario.cookies.get("sigeo_refresh") == anterior:
        raise RuntimeError("Refresh não rotacionou.")
    confirmar(
        requests.post(BASE + "/auth/esqueci-senha", json={"email": email}, timeout=20), 200, "Pedido de redefinição"
    )
    token_reset = token_da_caixa(ambiente, email)
    nova_senha = secrets.token_urlsafe(24)
    confirmar(
        requests.post(BASE + "/auth/redefinir-senha", json={"token": token_reset, "password": nova_senha}, timeout=15),
        200,
        "Redefinição de senha",
    )
    confirmar(
        requests.post(BASE + "/auth/redefinir-senha", json={"token": token_reset, "password": nova_senha}, timeout=15),
        400,
        "Redefinição de uso único",
    )
    novo = login(email, nova_senha)
    confirmar(novo.get(BASE + "/auth/me", timeout=15), 200, "Login após redefinição")
    confirmar(novo.post(BASE + "/auth/logout", timeout=15), 200, "Logout")
    confirmar(novo.get(BASE + "/auth/me", timeout=15), 401, "Sessão encerrada")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, required=True)
    args = parser.parse_args()
    try:
        validar(args.env)
    except Exception as erro:
        # Não imprimir exception: requests pode incluir conteúdo com segredo.
        print("Validação interrompida: " + type(erro).__name__)
        raise SystemExit(1) from None
