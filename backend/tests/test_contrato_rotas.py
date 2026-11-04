"""Toda rota JSON declara `response_model`; rota de arquivo declara `response_model=None` de propósito."""

from fastapi.routing import APIRoute

from app.main import app

# Rotas que devolvem arquivo (streaming), não JSON.
ROTAS_DE_ARQUIVO = {("/relatorios", "GET")}


def test_toda_rota_json_declara_response_model():
    sem_modelo = []
    for rota in app.routes:
        if not isinstance(rota, APIRoute) or rota.status_code == 204:
            continue
        for metodo in (rota.methods or set()) - {"HEAD", "OPTIONS"}:
            if (rota.path, metodo) in ROTAS_DE_ARQUIVO:
                continue
            if rota.response_model is None:
                sem_modelo.append(f"{metodo} {rota.path}")
    assert sem_modelo == []
