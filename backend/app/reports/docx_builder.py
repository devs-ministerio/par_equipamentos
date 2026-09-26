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

from docx import Document
from docx.document import Document as DocumentType
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run

from app.reports.formatacao import formatar_data, formatar_moeda

_VERDE_VARIACAO = RGBColor(0x15, 0x80, 0x3D)
_VERMELHO_VARIACAO = RGBColor(0xB9, 0x1C, 0x1C)
_CINZA_LEGENDA = RGBColor(0x6B, 0x72, 0x80)

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
        f"Documento gerado automaticamente pelo SIGEO em {gerado_em.strftime('%d/%m/%Y %H:%M')} "
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
    _aplicar_bordas(tabela)
    for celula, cabecalho in zip(tabela.rows[0].cells, colunas, strict=True):
        run = celula.paragraphs[0].add_run(cabecalho)
        run.bold = True
    for linha in linhas:
        celulas = tabela.add_row().cells
        for celula, valor in zip(celulas, linha, strict=True):
            celula.paragraphs[0].add_run("" if valor is None else str(valor))
    return tabela


def linhas_como_texto(
    colunas: Sequence[str],
    linhas: Sequence[Sequence[Any]],
    *,
    colunas_moeda: Sequence[str] = (),
    colunas_data: Sequence[str] = (),
) -> list[list[str]]:
    """Word não tem número/data nativos numa tabela de texto -- formata pt-BR
    (`app/reports/formatacao.py`) por NOME de coluna antes de passar pra
    `adicionar_tabela`. Complementa `xlsx_builder.escrever_aba_tabela`, que
    faz o equivalente no Excel via `number_format` (mantendo o valor cru)."""
    moeda = set(colunas_moeda)
    data = set(colunas_data)
    resultado: list[list[str]] = []
    for linha in linhas:
        nova_linha: list[str] = []
        for cabecalho, valor in zip(colunas, linha, strict=True):
            if cabecalho in moeda:
                nova_linha.append(formatar_moeda(valor))
            elif cabecalho in data:
                nova_linha.append(formatar_data(valor))
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
