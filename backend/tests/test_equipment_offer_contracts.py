"""Contratos HTTP das leituras de oferta, contra a fixture sintética do CI."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
_BASE = {"equipment_family": "TOMOGRAFO"}


def test_listagem_exige_sessao():
    response = client.get("/equipment-offer-rows", params=_BASE)

    assert response.status_code == 401


def test_listagem_filtra_municipio_ordena_e_pagina(headers_autenticados):
    response = client.get(
        "/equipment-offer-rows",
        params={**_BASE, "municipality": "Cidade Alfa|DF", "sort_by": "existing_qty", "sort_dir": "desc"},
        headers=headers_autenticados,
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["cnes_code"] == "9000001"


def test_listagem_rejeita_limite_invalido(headers_autenticados):
    response = client.get("/equipment-offer-rows", params={**_BASE, "limit": 0}, headers=headers_autenticados)

    assert response.status_code == 422


def test_totais_por_natureza_mantem_disponibilidade_sus_em_uso(headers_autenticados):
    response = client.get("/equipment-offer-rows/by-legal-nature", params=_BASE, headers=headers_autenticados)

    assert response.status_code == 200
    assert response.json() == [{"legal_nature": "PUBLICO", "existing_qty": 6, "available_qty": 3}]


def test_opcoes_de_estabelecimento_sao_completas_e_ordenadas(headers_autenticados):
    response = client.get("/equipment-offer-rows/facilities", params=_BASE, headers=headers_autenticados)

    assert response.status_code == 200
    assert [item["cnes_code"] for item in response.json()] == ["9000001", "9000002", "9000003"]


def test_estabelecimentos_respeita_filtro_sus_em_uso(headers_autenticados):
    response = client.get(
        "/equipment-offer-rows/establishments",
        params={**_BASE, "sus_flag": True, "in_use_sus": True},
        headers=headers_autenticados,
    )

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert {item["cnes_code"] for item in response.json()["items"]} == {"9000001", "9000003"}


def test_estabelecimentos_no_raio_aplica_distancia_exata(headers_autenticados):
    response = client.get(
        "/equipment-offer-rows/establishments",
        params={
            **_BASE,
            "near_lat": 0,
            "near_lon": 0,
            "radius_km": 20,
            "sus_flag": True,
            "in_use_sus": True,
        },
        headers=headers_autenticados,
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["cnes_code"] == "9000001"
