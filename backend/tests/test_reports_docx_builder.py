"""app/reports/docx_builder.py -- builder generico de documento (Plan Mode
docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 1)."""

from __future__ import annotations

from io import BytesIO

from docx import Document

from app.reports.docx_builder import (
    adicionar_paragrafo,
    adicionar_tabela,
    adicionar_titulo,
    escrever_variacao,
    gerar_bytes,
    novo_documento,
)


def test_novo_documento_grava_titulo_como_heading():
    documento = novo_documento("Relatorio de Convenios")
    reaberto = Document(BytesIO(gerar_bytes(documento)))
    assert reaberto.paragraphs[0].text == "Relatorio de Convenios"
    estilo = reaberto.paragraphs[0].style
    assert estilo is not None and estilo.name == "Title"


def test_adicionar_titulo_usa_o_nivel_pedido():
    documento = novo_documento("Capa")
    adicionar_titulo(documento, "Convenios", nivel=1)
    reaberto = Document(BytesIO(gerar_bytes(documento)))
    assert reaberto.paragraphs[1].text == "Convenios"
    estilo = reaberto.paragraphs[1].style
    assert estilo is not None and estilo.name == "Heading 1"


def test_adicionar_paragrafo_grava_texto():
    documento = novo_documento("Capa")
    adicionar_paragrafo(documento, "Filtro: Regiao Nordeste")
    reaberto = Document(BytesIO(gerar_bytes(documento)))
    assert reaberto.paragraphs[-1].text == "Filtro: Regiao Nordeste"


def test_adicionar_tabela_grava_cabecalho_em_negrito_e_linhas():
    documento = novo_documento("Capa")
    tabela = adicionar_tabela(documento, ["UF", "Convenios"], [["MG", 12], ["BA", 7]])
    assert len(tabela.rows) == 3
    assert tabela.rows[0].cells[0].text == "UF"
    assert tabela.rows[0].cells[0].paragraphs[0].runs[0].bold is True
    assert tabela.rows[1].cells[0].text == "MG"
    assert tabela.rows[2].cells[1].text == "7"


def test_adicionar_tabela_valor_none_vira_celula_vazia():
    documento = novo_documento("Capa")
    tabela = adicionar_tabela(documento, ["UF", "Nota"], [["MG", None]])
    assert tabela.rows[1].cells[1].text == ""


def test_escrever_variacao_positiva_fica_verde():
    documento = novo_documento("Capa")
    paragrafo = documento.add_paragraph()
    run = escrever_variacao(paragrafo, 12.3)
    assert run.text == "+12.3%"
    assert str(run.font.color.rgb) == "15803D"


def test_escrever_variacao_negativa_fica_vermelha():
    documento = novo_documento("Capa")
    paragrafo = documento.add_paragraph()
    run = escrever_variacao(paragrafo, -4.0)
    assert run.text == "-4.0%"
    assert str(run.font.color.rgb) == "B91C1C"


def test_escrever_variacao_none_escreve_traco_sem_cor():
    documento = novo_documento("Capa")
    paragrafo = documento.add_paragraph()
    run = escrever_variacao(paragrafo, None)
    assert run.text == "--"
    assert run.font.color.rgb is None
