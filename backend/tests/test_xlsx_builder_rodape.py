"""Legenda no rodapé fica fora do filtro; Resumo empilha blocos."""

from io import BytesIO

from openpyxl import load_workbook

from app.reports import xlsx_builder


def _abrir(pasta):
    return load_workbook(BytesIO(xlsx_builder.gerar_bytes(pasta)))


def test_rodape_fica_depois_de_linha_em_branco_e_fora_do_filtro():
    pasta = xlsx_builder.nova_pasta()
    xlsx_builder.escrever_aba_tabela(
        pasta, "Registros", ["A", "B"], [["1", "2"], ["3", "4"]], rodape=[["Legenda", ""], ["A", "primeira coluna"]]
    )
    aba = _abrir(pasta)["Registros"]
    assert aba.auto_filter.ref == "A1:B3"
    assert aba.freeze_panes == "A2"
    assert [c.value for c in aba[4]] == [None, None]
    assert aba["A5"].value == "Legenda"
    assert aba["B6"].value == "primeira coluna"


def test_aba_blocos_empilha_titulo_colunas_e_linhas():
    pasta = xlsx_builder.nova_pasta()
    xlsx_builder.escrever_aba_blocos(
        pasta,
        "Resumo",
        [
            xlsx_builder.BlocoAba(None, ["Campo", "Valor"], [["Recorte", "Brasil"]]),
            xlsx_builder.BlocoAba("Por situação", ["Situação", "Unidades"], [["Em operação", 63]]),
        ],
    )
    aba = _abrir(pasta)["Resumo"]
    valores = [[c.value for c in linha] for linha in aba.iter_rows(max_col=2)]
    assert valores[0] == ["Campo", "Valor"]
    assert ["Por situação", None] in valores
    assert ["Em operação", 63] in valores


def test_rodape_impresso_com_titulo_em_negrito_e_linhas_vazias_fora_do_filtro():
    pasta = xlsx_builder.nova_pasta()
    xlsx_builder.escrever_aba_tabela(
        pasta, "Registros", ["A", "B"], [[1, 2]], rodape=[["Legenda", ""], [], ["=nota", "=literal"]]
    )
    aba = _abrir(pasta)["Registros"]
    assert aba["A4"].font.bold
    assert aba["A5"].value is None
    assert aba["A6"].value == "=nota" and aba["A6"].data_type == "s"
    assert aba.auto_filter.ref == "A1:B2"
    assert "$A$1:$B$6" in str(aba.print_area)
