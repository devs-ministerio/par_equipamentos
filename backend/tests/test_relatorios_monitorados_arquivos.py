from datetime import date
from io import BytesIO

import pytest
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from openpyxl import load_workbook

from app.reports.monitorados import gerar_monitorados
from app.reports.xlsx_builder import FORMATO_MOEDA
from app.services.relatorios_equipamentos_modelo import COLUNAS_EQUIPAMENTO_COMPLETO, DATAS, MOEDA
from app.services.relatorios_modelo import EquipamentoDoInstrumento, RelatorioMonitorado, Tabela


def _relatorio(**extra):
    base = dict(
        titulo="Equipamentos",
        colunas=("A", "Data"),
        linhas=[("x", date(2026, 1, 10))],
        total=1,
        unidade="unidades",
        cabecalho=(("Recorte", "MG"), ("Filtros", "f"), ("Referência", "26/11/2026"), ("Fonte", "SISGEO")),
        indicadores=(("Unidades", 1),),
        quebras=(Tabela("Por situação", ("Situação", "Total", "%"), [("Em operação", 1, "100%"), ("Total", 1, "100%")]),),
        abas=(Tabela("Ações em aberto", ("Ação",), [("Enviar parecer",)]),),
        legenda=(("A", "primeira coluna"),),
        colunas_data=("Data",),
    )
    base.update(extra)
    return RelatorioMonitorado(**base)


def _xlsx(r):
    return load_workbook(BytesIO(gerar_monitorados(r, formato="xlsx", recorte="MG")))


def test_excel_tem_resumo_registros_e_abas_extras_com_legenda_no_rodape():
    pasta = _xlsx(_relatorio())
    assert pasta.sheetnames == ["Resumo", "Registros", "Ações em aberto"]
    resumo = [[c.value for c in linha] for linha in pasta["Resumo"].iter_rows(max_col=2)]
    assert ["Fonte", "SISGEO"] in resumo and ["Em operação", 1] in resumo
    registros = pasta["Registros"]
    assert registros.auto_filter.ref == "A1:B2"
    assert registros["A4"].value == "Legenda"


def test_excel_formata_moeda_em_registros_abas_extras_e_resumo():
    r = _relatorio(
        colunas=("A", "Valor do Equipamento"),
        linhas=[("x", 1500.5)],
        colunas_moeda=("Valor do Equipamento",),
        quebras=(Tabela("Valor do equipamento", ("Situação", "Valor"), [("Planejado", 10.0)], colunas_moeda=("Valor",)),),
        abas=(Tabela("Extra", ("Item", "Preço"), [("a", 3.0)], colunas_moeda=("Preço",)),),
    )
    pasta = _xlsx(r)
    assert pasta["Registros"]["B2"].number_format == FORMATO_MOEDA
    assert pasta["Registros"]["B2"].value == 1500.5
    assert pasta["Extra"]["B2"].number_format == FORMATO_MOEDA
    achadas = [c for linha in pasta["Resumo"].iter_rows() for c in linha if c.value == 10.0]
    assert achadas and achadas[0].number_format == FORMATO_MOEDA


def test_excel_nao_formata_como_moeda_o_que_nao_e_moeda():
    pasta = _xlsx(_relatorio())
    celula = next(c for linha in pasta["Resumo"].iter_rows() for c in linha if c.value == "Unidades")
    assert pasta["Resumo"].cell(celula.row, 2).number_format == "General"


def test_excel_rodape_e_blocos_nao_viram_formula():
    r = _relatorio(
        legenda=(("=1+1", "=HYPERLINK(\"http://x\")"),),
        indicadores=(("=2+2", "=3+3"),),
        quebras=(Tabela("=T", ("=C", "Total"), [("=SUM(1,2)", 1)]),),
    )
    pasta = _xlsx(r)
    for nome in ("Resumo", "Registros"):
        for linha in pasta[nome].iter_rows():
            for c in linha:
                assert c.data_type != "f", (nome, c.coordinate, c.value)
    registros = pasta["Registros"]
    assert registros["A5"].value == "=1+1" and registros["A5"].data_type == "s"
    textos = [c.value for linha in pasta["Resumo"].iter_rows() for c in linha]
    assert "=SUM(1,2)" in textos and "=2+2" in textos


def test_word_simplificado_e_nota_sem_tabela_de_registros():
    doc = Document(BytesIO(gerar_monitorados(_relatorio(), formato="docx", recorte="MG")))
    texto = "\n".join(p.text for p in doc.paragraphs)
    assert "SISGEO" in texto and "26/11/2026" in texto
    assert len(doc.tables) == 1


def test_word_completo_acrescenta_registros_com_data_e_moeda_formatadas():
    r = _relatorio(
        colunas=("A", "Data", "Valor do Equipamento"),
        linhas=[("x", date(2026, 1, 10), 1234.5)],
        colunas_moeda=("Valor do Equipamento",),
        quebras=(Tabela("Valor do equipamento", ("Situação", "Valor"), [("Planejado", 10.0)], colunas_moeda=("Valor",)),),
    )
    doc = Document(BytesIO(gerar_monitorados(r, formato="docx", recorte="MG", nivel="completo")))
    assert len(doc.tables) == 2
    assert doc.tables[0].rows[1].cells[1].text == "R$ 10,00"
    assert [c.text for c in doc.tables[1].rows[1].cells] == ["x", "10/01/2026", "R$ 1.234,50"]


@pytest.mark.parametrize("formato", ["xlsx", "docx"])
def test_sem_cabecalho_cai_no_resumo_antigo(formato):
    r = _relatorio(cabecalho=(), indicadores=(), quebras=(), abas=(), legenda=())
    assert gerar_monitorados(r, formato=formato, recorte="MG").startswith(b"PK")


def test_word_mostra_filtros_ativos_da_mesma_extracao():
    doc = Document(BytesIO(gerar_monitorados(_relatorio(), formato="docx", recorte="MG")))
    assert "Filtros: f" in "\n".join(p.text for p in doc.paragraphs)


def test_word_moeda_ausente_fica_vazia_e_zero_real_continua_zero():
    r = _relatorio(colunas=("Valor do Equipamento",), linhas=[(None,), (0.0,)],
                   colunas_moeda=("Valor do Equipamento",))
    doc = Document(BytesIO(gerar_monitorados(r, formato="docx", recorte="MG", nivel="completo")))
    assert doc.tables[1].rows[1].cells[0].text == ""
    assert doc.tables[1].rows[2].cells[0].text == "R$ 0,00"


def test_excel_cabecalho_tambem_permanece_texto_literal():
    pasta = _xlsx(_relatorio(colunas=("=1+1",), linhas=[("literal",)]))
    assert pasta["Registros"]["A1"].value == "=1+1"
    assert pasta["Registros"]["A1"].data_type == "s"


def test_word_equipamentos_completo_agrupa_registros_por_instrumento():
    def linha(numero, serie, valor):
        return (
            numero, "0030001", "Hospital Alfa", "Belo Horizonte", "MG", "Sudeste", "Convênio", "Acelerador Linear",
            "0100 – Acelerador linear", "Em operação", "Em execução", "Concluído", 1, valor, date(2026, 1, 10),
            date(2026, 1, 15), "Realizada", "12345", 2024, date(2024, 1, 1), date(2026, 12, 31),
            "Fabricante A", "Modelo B", serie, "Almeida",
        )

    relatorio = _relatorio(
        colunas=COLUNAS_EQUIPAMENTO_COMPLETO, linhas=[linha("100", "SN1", 1234.5), linha("200", None, None),
                                                       linha("100", "SN2", 0.0)],
        colunas_data=DATAS, colunas_moeda=MOEDA, arquivo_base="equipamentos", total=3,
    )
    doc = Document(BytesIO(gerar_monitorados(relatorio, formato="docx", nivel="completo", recorte="MG")))
    assert len(doc.tables) == 3
    titulos = [p.text for p in doc.paragraphs if p.text.startswith("Instrumento ")]
    assert titulos == ["Instrumento 100", "Instrumento 200"]
    dados = next(p for p in doc.paragraphs if p.text.startswith("Estabelecimento:"))
    assert dados.paragraph_format.keep_with_next
    assert "CNES: 0030001" in dados.text
    cadastro = next(p.text for p in doc.paragraphs if p.text.startswith("Instrumento:"))
    assert "Processo: 12345" in cadastro and "Fim da vigência: 31/12/2026" in cadastro
    ficha = doc.tables[1]
    assert not ficha.autofit and len(ficha.columns) == 7
    assert [c.text for c in ficha.rows[0].cells] == [
        "Equipamento", "Descrição do item do plano", "Situação", "Qtd", "Valor", "Entrega", "Inauguração",
    ]
    assert [c.text for c in ficha.rows[1].cells] == [
        "Acelerador Linear", "0100 – Acelerador linear", "Em operação", "1",
        "R$ 1.234,50", "10/01/2026", "15/01/2026\nRealizada",
    ]
    assert ficha.rows[2].cells[4].text == "R$ 0,00"
    assert doc.tables[2].rows[1].cells[4].text == ""


def test_word_instrumentos_completo_preserva_os_campos_em_fichas():
    from app.services.relatorios_instrumentos_modelo import _COLUNAS_COMPLETO

    colunas = _COLUNAS_COMPLETO
    assert len(colunas) == 30
    assert set(colunas).isdisjoint({"Técnico Suplente", "Responsável pela Execução", "Contato", "Última Movimentação"})
    campos_equipamento = {"Equipamentos", "Qtd Planejado", "Qtd Entregue", "Qtd em Operação", "% Em Operação"}
    dados = {
        "Equipamentos": "Tomógrafo (2); Mamógrafo",
        "Qtd Planejado": 1, "Qtd Entregue": 2, "Qtd em Operação": 1, "% Em Operação": "33%",
    }
    linhas = [
        tuple((dados.get(c) if numero == 1 else None) if c in campos_equipamento else f"valor {numero}-{i:02d}."
              for i, c in enumerate(colunas))
        for numero in (1, 2)
    ]
    relatorio = _relatorio(
        titulo="Instrumentos", arquivo_base="instrumentos", unidade="instrumentos",
        colunas=colunas, linhas=linhas, total=2, colunas_data=(),
        equipamentos_por_instrumento={linhas[0][0]: [
            EquipamentoDoInstrumento("Tomógrafo", 2, 1, 1, 1250.5), EquipamentoDoInstrumento("Mamógrafo", 0, 1, 0),
        ]},
    )
    doc = Document(BytesIO(gerar_monitorados(relatorio, formato="docx", nivel="completo", recorte="RS")))
    titulos = [p for p in doc.paragraphs if p.style.name == "Heading 1" and " - " in p.text]
    ix_contratacao = colunas.index("Contratação")
    assert [p.text for p in titulos] == [f"{linha[ix_contratacao]} - {linha[0]}" for linha in linhas]
    assert all(p.style.font.bold for p in titulos)
    assert len(doc.tables) == 5
    for ficha, equipamentos, linha in zip(doc.tables[1::2], doc.tables[2::2], linhas, strict=True):
        assert ficha.autofit is False and len(ficha.columns) == 2
        assert [c.text for c in ficha.rows[0].cells] == ["Campo", "Informação"]
        secoes = [row for row in ficha.rows[1:] if len(row._tr.tc_lst) == 1]
        assert [r.cells[0].text for r in secoes] == [
            "Estabelecimento", "Instrumento", "Acompanhamento", "Datas e inauguração", "Valores",
        ]
        assert all(row.cells[0].paragraphs[0].runs[0].bold for row in secoes)
        assert {r.cells[0].text: r.cells[1].text for r in ficha.rows[1:] if len(r._tr.tc_lst) == 2} == {
            campo: valor for campo, valor in zip(colunas, linha, strict=True)
            if campo not in campos_equipamento and campo != "Instrumento"
        }
        espaco = ficha._tbl.getnext()
        assert espaco.tag == qn("w:p") and not espaco.xpath(".//w:t")
        assert espaco.getnext() is equipamentos._tbl
    assert [[c.text for c in row.cells] for row in doc.tables[2].rows] == [
        ["Equipamento", "Qtd Planejado", "Qtd entregue", "Em operação\n(dos entregues)", "Valor unitário"],
        ["Tomógrafo", "1", "1", "1", "R$ 1.250,50"],
        ["Mamógrafo", "0", "1", "0", ""],
        ["Total", "1", "2", "1", ""],
    ]
    linha_equipamento = doc.tables[2].rows[1]
    assert linha_equipamento.cells[1].paragraphs[0].alignment == WD_ALIGN_PARAGRAPH.CENTER
    assert linha_equipamento.cells[-1].paragraphs[0].alignment == WD_ALIGN_PARAGRAPH.RIGHT
    assert doc.tables[2].rows[-1].cells[0].paragraphs[0].runs[0].bold
    assert doc.tables[4].rows[-1].cells[0].text == "Nenhum equipamento neste recorte."
