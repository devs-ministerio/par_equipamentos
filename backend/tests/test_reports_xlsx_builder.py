"""app/reports/xlsx_builder.py -- builder generico de planilha (Plan Mode
docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 1)."""

from __future__ import annotations

from io import BytesIO

from openpyxl import load_workbook

from app.reports.xlsx_builder import colorir_variacao, escrever_aba_tabela, gerar_bytes, nova_pasta


def test_nova_pasta_nao_tem_aba_fantasma():
    pasta = nova_pasta()
    assert pasta.sheetnames == []


def test_escrever_aba_tabela_grava_cabecalho_e_linhas():
    pasta = nova_pasta()
    escrever_aba_tabela(pasta, "Cobertura", ["UF", "Cobertura %"], [["SP", 82.5], ["BA", 41.0]])

    reaberta = load_workbook(BytesIO(gerar_bytes(pasta)))
    aba = reaberta["Cobertura"]
    assert [c.value for c in aba[1]] == ["UF", "Cobertura %"]
    assert [c.value for c in aba[2]] == ["SP", 82.5]
    assert [c.value for c in aba[3]] == ["BA", 41.0]
    assert aba.freeze_panes == "A2"
    assert aba.auto_filter.ref == "A1:B3"


def test_titulo_de_aba_maior_que_31_caracteres_e_truncado():
    pasta = nova_pasta()
    aba = escrever_aba_tabela(pasta, "Um titulo de aba absurdamente comprido", [], [])
    assert len(aba.title) <= 31


def test_aba_sem_linhas_nao_define_autofilter():
    pasta = nova_pasta()
    aba = escrever_aba_tabela(pasta, "Vazia", ["A"], [])
    assert aba.auto_filter.ref is None


def test_colorir_variacao_positiva_fica_verde():
    pasta = nova_pasta()
    aba = escrever_aba_tabela(pasta, "Serie", ["Ano", "Var%"], [[2025, 10.0]])
    colorir_variacao(aba, coluna=2, linha=2, valor=10.0)
    assert aba.cell(row=2, column=2).font.color.rgb == "0015803D"


def test_colorir_variacao_negativa_fica_vermelha():
    pasta = nova_pasta()
    aba = escrever_aba_tabela(pasta, "Serie", ["Ano", "Var%"], [[2025, -5.0]])
    colorir_variacao(aba, coluna=2, linha=2, valor=-5.0)
    assert aba.cell(row=2, column=2).font.color.rgb == "00B91C1C"


def test_colorir_variacao_none_nao_pinta():
    pasta = nova_pasta()
    aba = escrever_aba_tabela(pasta, "Serie", ["Ano", "Var%"], [[2020, None]])
    colorir_variacao(aba, coluna=2, linha=2, valor=None)
    assert aba.cell(row=2, column=2).font.color.type == "theme"
