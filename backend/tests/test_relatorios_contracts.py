"""Contratos HTTP de GET /relatorios (Plan Mode docs/arquitetura/
planmode-relatorios-2026-09-25.md, Blocos 2, 4 e 5)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_gerar_relatorio_exige_sessao():
    response = client.get("/relatorios", params={"formato": "xlsx"})
    assert response.status_code == 401


def test_gerar_relatorio_xlsx_brasil_default_e_instrumentos_repasse(headers_autenticados):
    response = client.get("/relatorios", params={"formato": "xlsx"}, headers=headers_autenticados)

    assert response.status_code == 200
    assert response.headers["content-type"] == ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert (
        'filename="relatorio-instrumentos_repasse-brasil-simplificado.xlsx"' in response.headers["content-disposition"]
    )
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
    assert 'filename="relatorio-instrumentos_repasse-uf-completo.docx"' in response.headers["content-disposition"]


def test_gerar_relatorio_analise_merito_xlsx(headers_autenticados):
    response = client.get(
        "/relatorios",
        params={"formato": "xlsx", "tipo_relatorio": "analise_merito", "escopo": "uf", "uf": "DF"},
        headers=headers_autenticados,
    )
    assert response.status_code == 200
    assert 'filename="relatorio-analise_merito-uf-simplificado.xlsx"' in response.headers["content-disposition"]


def test_gerar_relatorio_analise_merito_escopo_cnes_e_422(headers_autenticados):
    response = client.get(
        "/relatorios",
        params={"formato": "xlsx", "tipo_relatorio": "analise_merito", "escopo": "cnes", "cnes": "9000001"},
        headers=headers_autenticados,
    )
    assert response.status_code == 422


def test_gerar_relatorio_ano_filtra_convenios(headers_autenticados):
    response = client.get(
        "/relatorios",
        params={"formato": "xlsx", "escopo": "uf", "uf": "DF", "ano": 2020},
        headers=headers_autenticados,
    )
    assert response.status_code == 200


def test_gerar_relatorio_escopo_regiao_sem_valor_e_422(headers_autenticados):
    response = client.get("/relatorios", params={"formato": "xlsx", "escopo": "regiao"}, headers=headers_autenticados)
    assert response.status_code == 422


def test_gerar_relatorio_formato_invalido_e_422(headers_autenticados):
    response = client.get("/relatorios", params={"formato": "pdf"}, headers=headers_autenticados)
    assert response.status_code == 422


def test_gerar_relatorio_tipo_relatorio_invalido_e_422(headers_autenticados):
    response = client.get(
        "/relatorios", params={"formato": "xlsx", "tipo_relatorio": "outro"}, headers=headers_autenticados
    )
    assert response.status_code == 422
