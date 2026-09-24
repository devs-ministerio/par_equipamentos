"""Contratos HTTP de instrumentos firmados, usando carga manual sintética."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_listagem_exige_sessao():
    response = client.get("/convenios")

    assert response.status_code == 401


def test_listagem_filtra_carga_manual_e_projeta_desembolso_integral(headers_autenticados):
    response = client.get(
        "/convenios",
        params={"tipo_contratacao": "FAF", "busca": "pytest", "tamanho_pagina": 1},
        headers=headers_autenticados,
    )

    assert response.status_code == 200
    corpo = response.json()
    assert corpo["total"] == 1
    item = corpo["itens"][0]
    assert item["numero"] == "__pytest_cnes_fk__"
    assert item["dados_oficiais_disponiveis"] is False
    assert item["desembolso_integral_da_carga"] is True
    assert item["valor_desembolsado"] == 125_000
    assert item["cnes_nome_estabelecimento"] == "CNES Pytest"


def test_detalhe_de_carga_manual_omite_payload_cru(headers_autenticados):
    response = client.get("/convenios/__pytest_cnes_fk__", headers=headers_autenticados)

    assert response.status_code == 200
    assert response.json()["siconv_raw"] is None
    assert response.json()["transferegov_raw"] is None


def test_convenio_inexistente_e_paginacao_invalida(headers_autenticados):
    inexistente = client.get("/convenios/inexistente", headers=headers_autenticados)
    paginacao_invalida = client.get("/convenios", params={"pagina": 0}, headers=headers_autenticados)

    assert inexistente.status_code == 404
    assert paginacao_invalida.status_code == 422
