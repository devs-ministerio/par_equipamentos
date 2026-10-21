"""Paridade com o layout vigente e isolamento das gerações progressivas."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from zipfile import ZipFile

import pytest
from docx import Document
from lxml import etree

from app.reports import docx_builder
from app.reports.docx_tabelado import SecaoTabela, gerar_bytes_tabelados


def estrutura(elemento):
    return elemento.tag, sorted(elemento.attrib.items()), elemento.text, [estrutura(c) for c in elemento]


@pytest.mark.parametrize("total", [0, 1, 4, 5, 6, 65, 257])
def test_preserva_xml_e_partes_do_modelo_de_producao(total):
    # Arrange
    linhas = [[f"  Município <{n}> & ação\nlinha\tfim ", "0000434", n, None] for n in range(total)]
    secao = SecaoTabela("Cobertura", ["Nome", "CNES", "Quantidade", "Ausente"], linhas)
    comum = docx_builder.novo_documento("Relatório")
    docx_builder.adicionar_titulo(comum, secao.titulo)
    docx_builder.adicionar_tabela(comum, secao.colunas, linhas)
    progressivo = docx_builder.novo_documento("Relatório")
    # Act
    antigo = docx_builder.gerar_bytes(comum)
    novo = gerar_bytes_tabelados(progressivo, [secao])
    # Assert: valores, fontes e layout XML, não apenas abertura do arquivo.
    with ZipFile(BytesIO(antigo)) as a, ZipFile(BytesIO(novo)) as b:
        assert b.testzip() is None
        assert a.namelist() == b.namelist()
        for nome in a.namelist():
            if nome == "word/document.xml":
                assert estrutura(etree.fromstring(a.read(nome))) == estrutura(etree.fromstring(b.read(nome)))
            else:
                assert a.read(nome) == b.read(nome)
    tabela = Document(BytesIO(novo)).tables[0]
    assert len(tabela.rows) == total + 1
    assert len(progressivo.tables[0].rows) == 1
    if total:
        assert tabela.cell(1, 1).text == "0000434"


def test_preserva_ordem_de_secoes_inclusive_vazia():
    # Arrange
    secoes = [
        SecaoTabela("Primeira", ["Nome"], [["ação"]]),
        SecaoTabela("Vazia", ["Nome"], []),
        SecaoTabela("Última", ["Nome"], [["conclusão"]]),
    ]
    # Act
    arquivo = gerar_bytes_tabelados(docx_builder.novo_documento("Capa"), secoes)
    # Assert
    reaberto = Document(BytesIO(arquivo))
    assert [p.text for p in reaberto.paragraphs] == ["Capa", "Primeira", "Vazia", "Última"]
    assert [[c.text for r in t.rows for c in r.cells] for t in reaberto.tables] == [
        ["Nome", "ação"],
        ["Nome"],
        ["Nome", "conclusão"],
    ]


def test_linha_invalida_nao_retornara_pacote_parcial_nem_trava_para_outra_thread():
    # Arrange / Act: construções reais, com uma falha no meio de chamadas concorrentes.
    def gerar(indice):
        valores = ["um", "dois"] if indice == 0 else [f"ação {indice}"]
        return gerar_bytes_tabelados(
            docx_builder.novo_documento(f"Capa {indice}"), [SecaoTabela("Tabela", ["Nome"], [valores])]
        )

    with ThreadPoolExecutor(max_workers=4) as pool:
        pedidos = [pool.submit(gerar, indice) for indice in range(4)]
        # Assert
        with pytest.raises(ValueError):
            pedidos[0].result(timeout=10)
        for indice in range(1, 4):
            reaberto = Document(BytesIO(pedidos[indice].result(timeout=10)))
            assert reaberto.paragraphs[0].text == f"Capa {indice}"
            assert reaberto.tables[0].cell(1, 0).text == f"ação {indice}"


def test_recusa_template_preenchido_sem_descartar_tabela():
    # Arrange
    documento = docx_builder.novo_documento("Preenchido")
    docx_builder.adicionar_tabela(documento, ["Nome"], [["preservar"]])
    # Act / Assert
    with pytest.raises(ValueError, match="iniciar sem tabelas"):
        gerar_bytes_tabelados(documento, [])
    assert documento.tables[0].cell(1, 0).text == "preservar"
