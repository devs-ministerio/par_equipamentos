"""Gravação progressiva do DOCX tabular, preservando o layout de produção."""

from collections.abc import Sequence
from copy import deepcopy
from dataclasses import dataclass
from io import BytesIO
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

from docx.document import Document as DocumentType
from docx.oxml.ns import qn
from docx.table import Table
from lxml import etree

from app.reports import docx_builder


@dataclass(frozen=True)
class SecaoTabela:
    titulo: str
    colunas: Sequence[str]
    # Mesmo contrato de células do builder existente; não contém domínio.
    linhas: Sequence[Sequence[Any]]


def _escrever_tabela(xml: etree.xmlfile, tabela: Table, secao: SecaoTabela) -> None:
    with xml.element(tabela._tbl.tag, tabela._tbl.attrib):
        xml.write(tabela._tbl.tblPr)
        xml.write(tabela._tbl.tblGrid)
        xml.write(tabela.rows[0]._tr)
        modelo = tabela.add_row()
        for celula in modelo.cells:
            celula.paragraphs[0].add_run()
        tabela._tbl.remove(modelo._tr)
        for valores in secao.linhas:
            linha = deepcopy(modelo._tr)
            # O template tem exatamente um run por célula. CT_R.text é o
            # mesmo setter usado por Run.text (inclusive tabs e quebras),
            # sem reconstruir proxies de tabela/célula para cada valor.
            for run, valor in zip(linha.iter(qn("w:r")), valores, strict=True):
                run.text = "" if valor is None else str(valor)
            xml.write(linha)


def gerar_bytes_tabelados(documento: DocumentType, secoes: Sequence[SecaoTabela]) -> bytes:
    """Não acumula o XML dos dados nem cria arquivo temporário com informações."""
    with docx_builder._TRAVA_XML:
        if documento.tables:
            raise ValueError("O documento tabulado deve iniciar sem tabelas.")
        tabelas = []
        for secao in secoes:
            docx_builder.adicionar_titulo(documento, secao.titulo)
            tabelas.append(docx_builder.adicionar_tabela(documento, secao.colunas, []))
        modelo = docx_builder.gerar_bytes(documento)
        saida = BytesIO()
        with ZipFile(BytesIO(modelo)) as origem, ZipFile(saida, "w", compression=ZIP_DEFLATED) as destino:
            for parte in origem.infolist():
                if parte.filename != "word/document.xml":
                    destino.writestr(parte, origem.read(parte.filename))
                    continue
                with destino.open(parte, "w") as membro, etree.xmlfile(membro, encoding="UTF-8") as xml:
                    xml.write_declaration(standalone=True)
                    raiz = documento._element
                    with xml.element(raiz.tag, raiz.attrib, nsmap=raiz.nsmap):
                        with xml.element(raiz.body.tag, raiz.body.attrib):
                            tabelas_secoes = iter(zip(tabelas, secoes, strict=True))
                            for bloco in raiz.body:
                                if bloco.tag == qn("w:tbl"):
                                    tabela, secao = next(tabelas_secoes)
                                    _escrever_tabela(xml, tabela, secao)
                                else:
                                    xml.write(bloco)
        return saida.getvalue()
