import json
import logging

from fastapi.testclient import TestClient

from app.main import app


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
