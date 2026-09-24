import json
import logging
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_boot_desativa_access_log_cru_do_uvicorn():
    script = (Path(__file__).parents[1] / "start-server.sh").read_text()

    assert script.count("--no-access-log") == 2


def test_log_http_nao_registra_querystring_ou_segredo(caplog):
    caplog.set_level(logging.INFO, logger="sigeo.http")

    with TestClient(app) as client:
        response = client.get("/docs?token=segredo-nao-deve-ir-ao-log")

    assert response.status_code == 200
    assert response.headers["X-Trace-Id"]

    eventos = [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.name == "sigeo.http"
    ]
    evento = next(item for item in eventos if item["event"] == "http_request")
    texto_evento = json.dumps(evento)

    assert evento["path"] == "/docs"
    assert "query" not in evento
    assert "token" not in texto_evento
    assert "segredo-nao-deve-ir-ao-log" not in texto_evento


def test_trace_id_do_cliente_so_aceita_formato_opaco(caplog):
    caplog.set_level(logging.INFO, logger="sigeo.http")
    trace_id = "a" * 32

    with TestClient(app) as client:
        response = client.get("/docs", headers={"X-Trace-Id": trace_id})
        resposta_invalida = client.get("/docs", headers={"X-Trace-Id": "nao-e-um-trace"})

    eventos = [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.name == "sigeo.http" and json.loads(record.getMessage())["event"] == "http_request"
    ]
    assert response.headers["X-Trace-Id"] == trace_id
    assert eventos[-2]["trace_id"] == trace_id
    assert resposta_invalida.headers["X-Trace-Id"] != "nao-e-um-trace"
    assert len(resposta_invalida.headers["X-Trace-Id"]) == 32


def test_cors_autoriza_cabecalho_de_trace_do_frontend():
    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "X-Trace-Id",
            },
        )

    assert response.status_code == 200
    assert "x-trace-id" in response.headers["access-control-allow-headers"].lower()
