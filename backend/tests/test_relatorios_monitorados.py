"""Extração e exportação das fases selecionadas no relatório de instrumentos."""

from io import BytesIO

from docx import Document
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import InstrumentoEquipamento
from app.routers.relatorios import router
from app.services import relatorios_monitorados
from app.services.fase_acompanhamento import FaseAcompanhamento
from app.services.monitoramento_instrumentos import InstrumentoComFase


def test_previa_word_excel_consideram_as_mesmas_fases(monkeypatch):
    fases = (
        FaseAcompanhamento.em_aquisicao,
        FaseAcompanhamento.concluido,
        FaseAcompanhamento.pos_entrega,
    )
    instrumentos = [
        InstrumentoComFase(
            instrumento=InstrumentoEquipamento(nr_convenio=str(indice), nome_convenente="Unidade de teste"),
            fase_atual=fase.value,
        )
        for indice, fase in enumerate(fases, start=1)
    ]
    monkeypatch.setattr(relatorios_monitorados, "_instrumentos", lambda *_: instrumentos)
    monkeypatch.setattr(relatorios_monitorados, "carregar_etapas", lambda **_: [])
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: None
    app.dependency_overrides[require_current_user] = lambda: None
    params = (
        ("tipo_relatorio", "instrumentos_monitorados"),
        ("escopo", "brasil"),
        ("fase_instrumento", fases[0].value),
        ("fase_instrumento", fases[1].value),
    )
    with TestClient(app) as cliente:
        resposta_previa = cliente.get("/relatorios/previa", params=params)
        assert resposta_previa.status_code == 200, resposta_previa.text
        previa = resposta_previa.json()
        assert previa["total"] == 2
        fases_esperadas = ["Em aquisição", "Concluído"]
        assert [linha[-1] for linha in previa["linhas"]] == fases_esperadas

        arquivos = {}
        for formato in ("xlsx", "docx"):
            resposta = cliente.get("/relatorios", params=[*params, ("formato", formato)])
            assert resposta.status_code == 200, resposta.text
            arquivos[formato] = resposta.content
    planilha = load_workbook(BytesIO(arquivos["xlsx"]), read_only=True)
    try:
        assert [linha[-1] for linha in list(planilha["Registros"].values)[1:]] == fases_esperadas
    finally:
        planilha.close()
    documento = Document(BytesIO(arquivos["docx"]))
    assert [linha.cells[-1].text for linha in documento.tables[0].rows[1:]] == fases_esperadas
