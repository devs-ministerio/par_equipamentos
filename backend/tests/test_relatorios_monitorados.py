"""Extração e exportação das fases selecionadas no relatório de instrumentos."""

from decimal import Decimal
from io import BytesIO

from docx import Document
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import Convenio, InstrumentoEquipamento
from app.repositories import relatorios_contexto
from app.routers.relatorios import router
from app.services import relatorios_monitorados
from app.services.fase_acompanhamento import FaseAcompanhamento
from app.services.monitoramento_instrumentos import InstrumentoComFase
from app.services.relatorios_instrumentos_modelo import _valores


def test_resumo_financeiro_combina_valores_numeric_com_cargas_manuais():
    oficial = Convenio(
        financeiro_fonte_confiavel=True,
        valor_global=Decimal("250.50"),
        valor_repasse=Decimal("200.20"),
        valor_desembolsado=Decimal("100.10"),
    )
    manual = Convenio(valor_global=Decimal("100.15"))
    valores_oficiais = _valores(oficial, InstrumentoEquipamento(tipo_contratacao="Convênio"))
    valores_manuais = _valores(manual, InstrumentoEquipamento(tipo_contratacao="FAF"))
    assert valores_oficiais.global_ == 250.50 and valores_oficiais.repassado == 100.10
    assert valores_manuais.global_ == valores_manuais.repassado == 100.15
    assert sum(v.global_ for v in (valores_oficiais, valores_manuais) if v.global_ is not None) == 350.65


def test_previa_word_excel_consideram_as_mesmas_fases(monkeypatch):
    fases = (
        FaseAcompanhamento.em_aquisicao,
        FaseAcompanhamento.concluido,
        FaseAcompanhamento.pos_entrega,
    )
    instrumentos = [
        InstrumentoComFase(
            instrumento=InstrumentoEquipamento(
                nr_convenio=str(indice), nome_convenente="Unidade de teste", tipo_contratacao=contratacao
            ),
            fase_atual=fase.value,
        )
        for indice, (fase, contratacao) in enumerate(zip(fases, ("Convênio", "TED", "FAF"), strict=True), start=1)
    ]
    monkeypatch.setattr(relatorios_monitorados, "_instrumentos", lambda *_: instrumentos)
    monkeypatch.setattr(relatorios_monitorados, "carregar_etapas", lambda **_: [])
    monkeypatch.setattr(relatorios_contexto, "convenios_por_numero", lambda *_: {})
    monkeypatch.setattr(relatorios_contexto, "nomes_cnes", lambda *_: {})
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
        coluna_fase = previa["colunas"].index("Situação (Monitoramento)")
        assert len(previa["colunas"]) == 14
        assert [linha[coluna_fase] for linha in previa["linhas"]] == fases_esperadas

        arquivos = {}
        for formato in ("xlsx", "docx"):
            resposta = cliente.get("/relatorios", params=[*params, ("formato", formato)])
            assert resposta.status_code == 200, resposta.text
            arquivos[formato] = resposta.content
    planilha = load_workbook(BytesIO(arquivos["xlsx"]), read_only=True)
    try:
        assert planilha.sheetnames == ["Resumo", "Instrumentos"]
        registros = planilha["Instrumentos"].iter_rows(max_row=3, values_only=True)
        assert len(next(registros)) == 14
        assert [linha[coluna_fase] for linha in registros] == fases_esperadas
        resumo = [linha[:2] for linha in planilha["Resumo"].values]
        assert ("Quantidade de Instrumentos", 2) in resumo
        filtros = next(valor for nome, valor in resumo if nome == "Filtros")
        assert "Convênio, TED" in filtros and "FAF" not in filtros
    finally:
        planilha.close()
    documento = Document(BytesIO(arquivos["docx"]))
    texto = "\n".join(p.text for p in documento.paragraphs)
    assert "Quantidade de Instrumentos: 2" in texto and "Convênio, TED" in texto
    assert "Documento gerado automaticamente" not in texto
    assert [linha.cells[0].text for linha in documento.tables[0].rows[1:]] == [*sorted(fases_esperadas), "Total"]
