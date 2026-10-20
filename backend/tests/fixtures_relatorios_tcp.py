"""Processo e proxy locais próprios; nenhum serviço já aberto é reutilizado."""

import json
import os
import socket
import subprocess
import sys
from contextlib import closing, contextmanager
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from time import monotonic, sleep

import pytest
import requests
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.auth import hash_password
from app.db.models import User, UserRole
from scripts import seed_monitoramento
from tests.fixtures_relatorios_preenchidos import criar_carteira_preenchida
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel

SENHA_TCP = "Senha-sintetica-tcp-2026!"


@contextmanager
def proxy_api(porta_backend):
    class Proxy(BaseHTTPRequestHandler):
        def do_GET(self):
            self.encaminhar()

        def do_POST(self):
            self.encaminhar()

        def encaminhar(self):
            if not self.path.startswith("/api/"):
                self.send_error(404)
                return
            corpo = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            headers = {k: v for k, v in self.headers.items() if k.lower() not in {"host", "connection"}}
            with closing(HTTPConnection("127.0.0.1", porta_backend, timeout=90)) as destino:
                destino.request(self.command, self.path.removeprefix("/api"), body=corpo, headers=headers)
                resposta = destino.getresponse()
                arquivo = resposta.read()
                self.send_response(resposta.status)
                for nome, valor in resposta.getheaders():
                    if nome.lower() not in {"content-length", "connection", "transfer-encoding"}:
                        self.send_header(nome, valor)
                self.send_header("Content-Length", str(len(arquivo)))
                self.end_headers()
                self.wfile.write(arquivo)

        def log_message(self, _format, *args):
            pass  # Nunca logar cookies/corpo nem requisições de autenticação.

    with ThreadingHTTPServer(("127.0.0.1", 0), Proxy) as servidor:
        thread = Thread(target=servidor.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{servidor.server_port}/api"
        finally:
            servidor.shutdown()
            thread.join(timeout=5)


def aguardar_backend(porta, processo):
    limite = monotonic() + 20
    while monotonic() < limite and processo.poll() is None:
        try:
            if requests.get(f"http://127.0.0.1:{porta}/health", timeout=1).status_code == 200:
                return
        except requests.RequestException:
            pass
        sleep(0.05)
    raise AssertionError("Servidor de teste não iniciou; consultar log privado do ensaio.")


@pytest.fixture
def servidor_relatorios_tcp(monkeypatch, tmp_path):
    with banco_descartavel() as (conexao, config):
        command.upgrade(config, "head")
        conexao.commit()
        sessoes = sessionmaker(bind=conexao.engine)
        monkeypatch.setattr(seed_monitoramento, "SessionLocal", sessoes)
        seed_monitoramento.run()
        emails = []
        with sessoes() as db:
            criar_carteira_preenchida(db, 500)
            for perfil in UserRole:
                email = f"tcp-{perfil.value}@example.com"
                db.add(
                    User(
                        name=f"Usuário TCP {perfil.value}",
                        email=email,
                        password_hash=hash_password(SENHA_TCP),
                        role=perfil,
                    )
                )
                emails.append(email)
            db.commit()

        def dominio():
            with sessoes() as db:
                return {
                    tabela: db.execute(
                        text(f"SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY id)) FROM {tabela} t")
                    ).scalar_one()
                    for tabela in (
                        "convenio",
                        "instrumento_equipamento",
                        "evento_marco",
                        "acao_monitoramento",
                        "equipamento_marcador",
                    )
                }

        ambiente = dict(os.environ)
        url = conexao.engine.url.render_as_string(hide_password=False)
        ambiente.update(
            # O filho roda fora do checkout; não herdar PYTHONPATH da máquina/CI.
            PYTHONPATH=str(Path(__file__).resolve().parents[1]),
            DATABASE_URL=url,
            DATABASE_URL_MIGRATION=url,
            NEW_RELIC_ENABLED="false",
            MAIL_API_URL="",
            MAIL_API_SECRET="",
            PORTAL_TRANSPARENCIA_API_KEY="",
            COOKIE_SECURE="false",
            REFRESH_COOKIE_PATH="/api/auth",
            ALLOWED_HOSTS="127.0.0.1",
        )
        launcher = Path(__file__).with_name("runtime_relatorios_tcp.py")
        recursos = tmp_path / "recursos-servidor.json"
        with socket.socket() as escuta, (tmp_path / "servidor.log").open("w") as log:
            escuta.bind(("127.0.0.1", 0))
            escuta.listen(128)
            processo = subprocess.Popen(
                [sys.executable, str(launcher), str(escuta.fileno()), str(recursos)],
                pass_fds=(escuta.fileno(),),
                cwd=tmp_path,
                env=ambiente,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                aguardar_backend(escuta.getsockname()[1], processo)
                with proxy_api(escuta.getsockname()[1]) as base:
                    yield base, emails, dominio, recursos
            finally:
                processo.terminate()
                try:
                    processo.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    processo.kill()  # Apenas este filho, nunca PID alheio ou servidor já aberto.
                    processo.wait(timeout=5)
        assert recursos.exists(), "Encerramento do filho não registrou recursos."
        medida = json.loads(recursos.read_text(encoding="utf-8"))
        assert medida["rss_pico_servidor_bytes"] > 0
        fonte = "proc_vm_hwm_pos_exec" if sys.platform.startswith("linux") else "rusage_darwin_bytes"
        assert medida["rss_pico_servidor_fonte"] == fonte
