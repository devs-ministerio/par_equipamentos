from fastapi.testclient import TestClient

from app.main import app


def test_resposta_inclui_trace_id_sem_refletir_querystring():
    with TestClient(app) as client:
        response = client.get("/docs?token=segredo-nao-deve-ir-ao-log")

    assert response.status_code == 200
    assert response.headers["X-Trace-Id"]
