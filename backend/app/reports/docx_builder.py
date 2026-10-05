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
from datetime import datetime
from io import BytesIO
from typing import Any
from zoneinfo import ZoneInfo

from docx import Document
from docx.document import Document as DocumentType
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run

from app.reports.formatacao import formatar_data, formatar_moeda

_VERDE_VARIACAO = RGBColor(0x15, 0x80, 0x3D)
_VERMELHO_VARIACAO = RGBColor(0xB9, 0x1C, 0x1C)
_CINZA_LEGENDA = RGBColor(0x6B, 0x72, 0x80)
_PRETO = RGBColor(0, 0, 0)

# Mesmo timbre institucional usado nos briefings reais do departamento
# (ver docs/relatorios em `data/relatorios/`, anexados pelo usuário
# 2026-09-26) -- documento gerado por aqui deixa explícito que é
# automático, nunca se apresenta como Nota Informativa/Briefing já
# revisado por um analista.
_CABECALHO_INSTITUCIONAL = (
    "Ministério da Saúde",
    "SAES -- Secretaria de Atenção Especializada à Saúde",
    "DECAN -- Departamento de Atenção ao Câncer",
    "CGPCAN -- Coordenação-Geral de Planejamento e Monitoramento do Câncer",
)


def novo_documento(titulo: str) -> DocumentType:
    documento = Document()
    secao = documento.sections[0]
    secao.page_width = Cm(21)
    secao.page_height = Cm(29.7)
    secao.top_margin = secao.bottom_margin = Cm(2)
    secao.left_margin = secao.right_margin = Cm(2)
    estilos = documento.styles
    normal = estilos["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(9.5)
    normal.font.color.rgb = _PRETO
    normal.paragraph_format.space_after = Pt(4)
    for nome, tamanho in (("Title", 16), ("Heading 1", 12), ("Heading 2", 10.5), ("Heading 3", 10), ("Heading 4", 9.5)):
        estilo = estilos[nome]
        estilo.font.name = "Arial"
        estilo.font.size = Pt(tamanho)
        estilo.font.color.rgb = _PRETO
        estilo.font.bold = True
        estilo.paragraph_format.space_before = Pt(9 if nome != "Title" else 0)
        estilo.paragraph_format.space_after = Pt(4)
        estilo.paragraph_format.keep_with_next = True
        estilo.paragraph_format.keep_together = True
        # O estilo Title do Word pode carregar uma borda azul temática.
        ppr = estilo.element.pPr
        if ppr is not None:
            bordas = ppr.find(qn("w:pBdr"))
            if bordas is not None:
                ppr.remove(bordas)
    rodape = secao.footer.paragraphs[0]
    rodape.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    texto = rodape.add_run("SIGEO  ·  Página ")
    texto.font.size = Pt(8)
    texto.font.color.rgb = _CINZA_LEGENDA
    campo = OxmlElement("w:fldSimple")
    campo.set(qn("w:instr"), "PAGE")
    rodape._p.append(campo)
    adicionar_titulo(documento, titulo, nivel=0)
    return documento


def adicionar_cabecalho_institucional(documento: DocumentType, *, gerado_em: datetime) -> None:
    for linha in _CABECALHO_INSTITUCIONAL:
        paragrafo = documento.add_paragraph()
        run = paragrafo.add_run(linha)
        run.bold = linha == _CABECALHO_INSTITUCIONAL[0]
        run.font.size = Pt(10)
    aviso = documento.add_paragraph()
    run_aviso = aviso.add_run(
        f"Documento gerado automaticamente pelo SIGEO em {gerado_em.astimezone(ZoneInfo('America/Sao_Paulo')).strftime('%d/%m/%Y %H:%M')} "
        "(horário de Brasília) "
        "-- não substitui conferência humana antes de circulação oficial."
    )
    run_aviso.italic = True
    run_aviso.font.size = Pt(9)
    run_aviso.font.color.rgb = _CINZA_LEGENDA


def adicionar_titulo(documento: DocumentType, texto: str, *, nivel: int = 1) -> None:
    documento.add_heading(texto, level=nivel)


def adicionar_paragrafo(documento: DocumentType, texto: str) -> None:
    documento.add_paragraph(texto)


def adicionar_paragrafo_rotulo_valor(documento: DocumentType, rotulo: str, valor: str) -> None:
    """`**Rótulo:** valor` -- mesmo padrão usado nos briefings reais do
    departamento pra ficha de instrumento (Convênio/SEI/Objeto/...)."""
    paragrafo = documento.add_paragraph()
    run_rotulo = paragrafo.add_run(f"{rotulo}: ")
    run_rotulo.bold = True
    paragrafo.add_run(valor)


def adicionar_legenda_tabela(documento: DocumentType, numero: int, texto: str) -> None:
    paragrafo = documento.add_paragraph()
    run = paragrafo.add_run(f"Tabela {numero}. {texto}")
    run.italic = True


def adicionar_fonte(documento: DocumentType, texto: str) -> None:
    paragrafo = documento.add_paragraph()
    run = paragrafo.add_run(f"Fonte: {texto}")
    run.italic = True
    run.font.size = Pt(9)
    run.font.color.rgb = _CINZA_LEGENDA


def adicionar_tabela(documento: DocumentType, colunas: Sequence[str], linhas: Sequence[Sequence[Any]]) -> Table:
    tabela = documento.add_table(rows=1, cols=len(colunas))
    tabela.alignment = WD_TABLE_ALIGNMENT.CENTER
    tabela.style = "Table Grid"
    _aplicar_bordas(tabela)
    propriedade_header = OxmlElement("w:tblHeader")
    propriedade_header.set(qn("w:val"), "true")
    tabela.rows[0]._tr.get_or_add_trPr().append(propriedade_header)
    for celula, cabecalho in zip(tabela.rows[0].cells, colunas, strict=True):
        run = celula.paragraphs[0].add_run(cabecalho)
        run.bold = True
        run.font.size = Pt(8.5)
        celula.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    for linha in linhas:
        row = tabela.add_row()
        row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        celulas = row.cells
        for celula, valor in zip(celulas, linha, strict=True):
            run = celula.paragraphs[0].add_run("" if valor is None else str(valor))
            run.font.size = Pt(8.5)
            celula.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    if not linhas:
        celulas = tabela.add_row().cells
        celulas[0].text = "Nenhum registro neste recorte."
    return tabela


def linhas_como_texto(
    colunas: Sequence[str],
    linhas: Sequence[Sequence[Any]],
    *,
    colunas_moeda: Sequence[str] = (),
    colunas_data: Sequence[str] = (),
    colunas_inteiro: Sequence[str] = (),
) -> list[list[str]]:
    """Word não tem número/data nativos numa tabela de texto -- formata pt-BR
    (`app/reports/formatacao.py`) por NOME de coluna antes de passar pra
    `adicionar_tabela`. Complementa `xlsx_builder.escrever_aba_tabela`, que
    faz o equivalente no Excel via `number_format` (mantendo o valor cru)."""
    moeda = set(colunas_moeda)
    data = set(colunas_data)
    inteiro = set(colunas_inteiro)
    resultado: list[list[str]] = []
    for linha in linhas:
        nova_linha: list[str] = []
        for cabecalho, valor in zip(colunas, linha, strict=True):
            if cabecalho in moeda:
                nova_linha.append(formatar_moeda(valor))
            elif cabecalho in data:
                nova_linha.append(formatar_data(valor))
            elif cabecalho in inteiro and valor is not None:
                nova_linha.append(f"{int(valor):,}".replace(",", "."))
            else:
                nova_linha.append("—" if valor is None else str(valor))
        resultado.append(nova_linha)
    return resultado


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
