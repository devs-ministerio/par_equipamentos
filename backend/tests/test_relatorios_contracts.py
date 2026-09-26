"""Contratos HTTP de GET /relatorios (Plan Mode docs/arquitetura/
planmode-relatorios-2026-09-25.md, Bloco 2)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_gerar_relatorio_exige_sessao():
    response = client.get("/relatorios", params={"formato": "xlsx"})
    assert response.status_code == 401


def test_gerar_relatorio_xlsx_brasil(headers_autenticados):
    response = client.get("/relatorios", params={"formato": "xlsx"}, headers=headers_autenticados)

    assert response.status_code == 200
    assert response.headers["content-type"] == ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert 'filename="relatorio-brasil-simplificado.xlsx"' in response.headers["content-disposition"]
    assert len(response.content) > 0


def test_gerar_relatorio_docx_uf_completo(headers_autenticados):
    response = client.get(
        "/relatorios",
        params={"formato": "docx", "nivel": "completo", "escopo": "uf", "uf": "DF"},
        headers=headers_autenticados,
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert 'filename="relatorio-uf-completo.docx"' in response.headers["content-disposition"]


def test_gerar_relatorio_escopo_regiao_sem_valor_e_422(headers_autenticados):
    response = client.get("/relatorios", params={"formato": "xlsx", "escopo": "regiao"}, headers=headers_autenticados)
    assert response.status_code == 422


def test_gerar_relatorio_formato_invalido_e_422(headers_autenticados):
    response = client.get("/relatorios", params={"formato": "pdf"}, headers=headers_autenticados)
    assert response.status_code == 422
