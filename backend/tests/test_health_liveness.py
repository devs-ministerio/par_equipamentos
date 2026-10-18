"""Contrato de vivacidade: provar que não depende do Postgres nem da sessão."""

from fastapi.testclient import TestClient
from sqlalchemy import event

from app.db.base import engine, get_db
from app.main import app


def test_liveness_publica_sem_db_e_sem_payload_sensivel(monkeypatch):
    def banco_proibido():
        raise AssertionError("Vivacidade nunca deve abrir sessão no banco")
        yield

    def conexao_proibida(*_args, **_kwargs):
        raise AssertionError("Vivacidade não pode conectar ao PostgreSQL")

    monkeypatch.setattr(app, "dependency_overrides", {**app.dependency_overrides, get_db: banco_proibido})
    event.listen(engine, "do_connect", conexao_proibida)
    try:
        with TestClient(app, base_url="https://testserver") as http:
            for _ in range(3):
                resposta = http.get("/health/live")
                assert resposta.status_code == 200
                assert resposta.json() == {"status": "ok"}
                assert resposta.headers["cache-control"] == "no-store"
                assert len(resposta.headers["x-trace-id"]) == 32
                assert resposta.headers["x-content-type-options"] == "nosniff"
                assert not resposta.cookies
    finally:
        event.remove(engine, "do_connect", conexao_proibida)


def test_prontidao_existente_continua_consultando_banco(monkeypatch):
    def banco_indisponivel():
        raise RuntimeError("Falha sintética da dependência DB")
        yield

    monkeypatch.setattr(app, "dependency_overrides", {**app.dependency_overrides, get_db: banco_indisponivel})
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as http:
        assert http.get("/health").status_code == 500
        assert http.get("/health/live").status_code == 200


def test_healthcheck_render_aponta_para_vivacidade():
    from pathlib import Path

    manifesto = (Path(__file__).resolve().parents[2] / "render.yaml").read_text()
    assert "healthCheckPath: /health/live" in manifesto
