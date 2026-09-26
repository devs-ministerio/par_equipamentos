"""Builder generico de documentos .docx para os relatorios (Plan Mode
docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 1).

Modulo puro: recebe dado ja formatado, devolve bytes. Sem FastAPI/DB.
Porta o padrao de estilo ja provado em producao pelo projeto irmao
nota-informativa-decan (RGBColor de variacao, tabela com borda via oxml),
sem importar codigo de la (ver "Achados" do plan-mode -- projetos com
infra/dominio/postura de seguranca diferentes, so a tecnica foi reaproveitada).
"""

from __future__ import annotations

from collections.abc import Sequence
from io import BytesIO
from typing import Any

from docx import Document
from docx.document import Document as DocumentType
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import RGBColor
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run

_VERDE_VARIACAO = RGBColor(0x15, 0x80, 0x3D)
_VERMELHO_VARIACAO = RGBColor(0xB9, 0x1C, 0x1C)


def novo_documento(titulo: str) -> DocumentType:
    documento = Document()
    adicionar_titulo(documento, titulo, nivel=0)
    return documento


def adicionar_titulo(documento: DocumentType, texto: str, *, nivel: int = 1) -> None:
    documento.add_heading(texto, level=nivel)


def adicionar_paragrafo(documento: DocumentType, texto: str) -> None:
    documento.add_paragraph(texto)


def adicionar_tabela(documento: DocumentType, colunas: Sequence[str], linhas: Sequence[Sequence[Any]]) -> Table:
    tabela = documento.add_table(rows=1, cols=len(colunas))
    tabela.alignment = WD_TABLE_ALIGNMENT.CENTER
    _aplicar_bordas(tabela)
    for celula, cabecalho in zip(tabela.rows[0].cells, colunas, strict=True):
        run = celula.paragraphs[0].add_run(cabecalho)
        run.bold = True
    for linha in linhas:
        celulas = tabela.add_row().cells
        for celula, valor in zip(celulas, linha, strict=True):
            celula.paragraphs[0].add_run("" if valor is None else str(valor))
    return tabela


def escrever_variacao(paragrafo: Paragraph, valor: float | None) -> Run:
    """Adiciona ao paragrafo o texto da variacao percentual, colorido de
    verde (positiva) ou vermelho (negativa). `valor is None` (primeiro ano
    da serie) escreve "--" sem cor."""
    if valor is None:
        return paragrafo.add_run("--")
    run = paragrafo.add_run(f"{valor:+.1f}%")
    run.font.color.rgb = _VERDE_VARIACAO if valor >= 0 else _VERMELHO_VARIACAO
    return run


def gerar_bytes(documento: DocumentType) -> bytes:
    buffer = BytesIO()
    documento.save(buffer)
    return buffer.getvalue()


def _aplicar_bordas(tabela: Table) -> None:
    propriedades = tabela._tbl.tblPr
    bordas = OxmlElement("w:tblBorders")
    for nome in ("top", "left", "bottom", "right", "insideH", "insideV"):
        borda = OxmlElement(f"w:{nome}")
        borda.set(qn("w:val"), "single")
        borda.set(qn("w:sz"), "4")
        borda.set(qn("w:color"), "999999")
        bordas.append(borda)
    propriedades.append(bordas)
