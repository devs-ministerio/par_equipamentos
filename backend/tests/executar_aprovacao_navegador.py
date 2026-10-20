"""Gate E2E opt-in: Chromium → HTTP → Service → PostgreSQL sintético restrito.

Executar explicitamente com o launcher de testes locais. Não integra a coleta
padrão de pytest, que não instala Node/Chromium. Nenhum dado do clone servido
é alterado; a fixture remove somente seu schema descartável no encerramento.
"""

import json
import os
import socket
import subprocess
from pathlib import Path
from tempfile import TemporaryFile
from threading import Thread
from time import monotonic, sleep

import httpx
import uvicorn
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.db.base import get_db
from app.db.models import Convenio, InstrumentoEquipamento, Notificacao, NotificacaoDestinatario, User
from app.db.models_legado import CandidatoLegadoDecisao
from app.main import app
from tests.runtime_radar_fixture import nome_runtime_sintetico
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_radar_append_only_recuperado_db import historico_protegido as historico_protegido
from tests.test_radar_runtime_restrito_db import runtime as runtime
from tests.test_revisao_legado_recuperada_db import preparar_prova


def aguardar_http(url, timeout=15):
    limite = monotonic() + timeout
    while monotonic() < limite:
        try:
            if httpx.get(url, timeout=1, trust_env=False).status_code == 200:
                return
        except httpx.TransportError:
            pass
        sleep(0.1)
    raise AssertionError("Servidor E2E local não iniciou no prazo.")


def test_aprovacao_real_em_navegador(runtime, historico_protegido, dados, monkeypatch):
    # Arrange: todos os registros e identidades são sintéticos, em schema privado.
    db, usuarios, schema = runtime
    runtime_nome = nome_runtime_sintetico(schema)
    bind = historico_protegido[0].get_bind()
    senha = "Senha-Sintetica-Navegador-2026!"
    hash_senha = hash_password(senha)
    contas = {}
    for perfil, chave in (("admin", "admin"), ("gestor", "gestor"), ("colaborador", "titular"), ("leitor", "leitor")):
        usuario = db.get(User, usuarios[chave])
        usuario.password_hash = hash_senha
        contas[perfil] = {"email": usuario.email, "senha": senha}
    db.commit()
    ref, _, _, _, _ = preparar_prova(db, dados)

    def sessao_restrita():
        with bind.connect() as conn:
            try:
                conn.execute(text(f'SET ROLE "{runtime_nome}"'))
                conn.execute(text(f'SET search_path TO "{schema}", pg_catalog'))
                conn.commit()
                with Session(conn) as sessao:
                    yield sessao
            finally:
                conn.rollback()
                conn.execute(text("RESET ROLE"))
                conn.execute(text("RESET search_path"))
                conn.commit()

    monkeypatch.setattr(app, "dependency_overrides", {**app.dependency_overrides, get_db: sessao_restrita})
    frontend = Path(__file__).resolve().parents[2] / "frontend"
    ambiente = {
        k: v for k, v in os.environ.items() if k in {"PATH", "HOME", "TMPDIR", "LANG", "PLAYWRIGHT_BROWSERS_PATH"}
    }
    ambiente.update(
        VITE_API_BASE_URL="http://127.0.0.1:8003",
        E2E_BASE_URL="http://127.0.0.1:5194",
        E2E_RADAR_LOCAL="1",
        E2E_RADAR_FIXTURE=json.dumps({"usuarios": contas, "candidato_id": ref.candidato_id}),
    )
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
    with socket.socket() as listener, TemporaryFile(mode="w+") as log_front:
        listener.bind(("127.0.0.1", 8003))
        thread = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        vite = subprocess.Popen(
            [
                "node",
                str(frontend / "node_modules/vite/bin/vite.js"),
                "--host",
                "127.0.0.1",
                "--port",
                "5194",
                "--strictPort",
            ],
            cwd=frontend,
            env=ambiente,
            stdout=log_front,
            stderr=subprocess.STDOUT,
        )
        try:
            aguardar_http("http://127.0.0.1:8003/health")
            aguardar_http("http://127.0.0.1:5194/login")
            # Act: não há interceptação de API, cookies ou Service no navegador.
            resultado = subprocess.run(
                [
                    "node",
                    str(frontend / "node_modules/@playwright/test/cli.js"),
                    "test",
                    "--project=radar-local-chromium",
                ],
                cwd=frontend,
                env=ambiente,
                timeout=120,
                check=False,
            )
            assert resultado.returncode == 0
        finally:
            vite.terminate()
            try:
                vite.wait(timeout=5)
            except subprocess.TimeoutExpired:
                vite.kill()
                vite.wait(timeout=5)
            server.should_exit = True
            thread.join(timeout=10)
            assert not thread.is_alive(), "API E2E não encerrou antes da limpeza."
    # Assert: confirmação da persistência fora do navegador e sem duplicação.
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Convenio)) == 2
    assert db.scalar(select(func.count()).select_from(InstrumentoEquipamento)) == 1
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoDecisao)) == 1
    assert db.scalar(select(func.count()).select_from(Notificacao)) == 1
    assert set(db.scalars(select(NotificacaoDestinatario.usuario_id))) == {usuarios["admin"], usuarios["gestor"]}
