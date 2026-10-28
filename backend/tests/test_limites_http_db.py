"""Limite de exportação visto pela pilha HTTP real, com sessão autenticada."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.rate_limit import limiter

# Pedido barato: o serviço recusa (422) sem consultar cobertura, mas o limite já contou.
_PARAMS = {"formato": "xlsx", "tipo_relatorio": "analise_merito", "escopo": "cnes", "cnes": "1"}


def test_exportacao_responde_429_na_11a_chamada_do_minuto(headers_autenticados):
    # Given
    limiter.reset()
    cliente = TestClient(app)
    try:
        # When
        codigos = [
            cliente.get("/relatorios", params=_PARAMS, headers=headers_autenticados).status_code for _ in range(11)
        ]
        # Then
        assert codigos[:10] == [422] * 10
        assert codigos[10] == 429
    finally:
        limiter.reset()
