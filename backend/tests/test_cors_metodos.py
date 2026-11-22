"""O preflight do navegador precisa aceitar todos os métodos que a API usa (PUT da previsão de entrega ficou de fora)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.mark.parametrize("metodo", ["GET", "POST", "PUT", "PATCH", "DELETE"])
def test_preflight_aceita_o_metodo(metodo):
    origem = settings.cors_origins_lista[0]
    resposta = TestClient(app).options(
        "/monitoramento/itens/1/previsao-entrega",
        headers={
            "Origin": origem,
            "Access-Control-Request-Method": metodo,
            "Access-Control-Request-Headers": "content-type,x-csrf-token",
        },
    )
    assert resposta.status_code == 200
