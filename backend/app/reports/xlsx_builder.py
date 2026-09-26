"""Builder generico de planilhas .xlsx para os relatorios (Plan Mode
docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 1).

Modulo puro: recebe dado ja formatado, devolve bytes. Sem FastAPI/DB --
quem monta o dado (Bloco 2, services/relatorios.py) decide o que entra em
cada aba; este arquivo so sabe desenhar tabela.
"""

from __future__ import annotations

from collections.abc import Sequence
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

_COR_CABECALHO = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
_FONTE_CABECALHO = Font(color="FFFFFF", bold=True)
_FONTE_VARIACAO_POSITIVA = Font(color="15803D")
_FONTE_VARIACAO_NEGATIVA = Font(color="B91C1C")
_LARGURA_MAXIMA_COLUNA = 60


def nova_pasta() -> Workbook:
    pasta = Workbook()
    # Workbook() ja vem com uma aba "Sheet" vazia -- removida pra quem
    # chamar escrever_aba_tabela nao acabar com uma aba fantasma no arquivo.
    pasta.remove(pasta.active)
    return pasta


def escrever_aba_tabela(
    pasta: Workbook,
    titulo: str,
    colunas: Sequence[str],
    linhas: Sequence[Sequence[Any]],
) -> Worksheet:
    aba = pasta.create_sheet(title=titulo[:31])
    aba.append(list(colunas))
    for celula in aba[1]:
        celula.fill = _COR_CABECALHO
        celula.font = _FONTE_CABECALHO
        celula.alignment = Alignment(horizontal="center")
    for linha in linhas:
        aba.append(list(linha))
    aba.freeze_panes = "A2"
    if linhas:
        aba.auto_filter.ref = f"A1:{get_column_letter(len(colunas))}{len(linhas) + 1}"
    _ajustar_largura_colunas(aba, colunas, linhas)
    return aba


def colorir_variacao(aba: Worksheet, coluna: int, linha: int, valor: float | None) -> None:
    """Pinta a celula de verde/vermelho conforme o sinal de `valor` (variacao
    percentual ano a ano). `valor is None` (primeiro ano da serie) nao pinta."""
    if valor is None:
        return
    celula = aba.cell(row=linha, column=coluna)
    celula.font = _FONTE_VARIACAO_POSITIVA if valor >= 0 else _FONTE_VARIACAO_NEGATIVA


def gerar_bytes(pasta: Workbook) -> bytes:
    buffer = BytesIO()
    pasta.save(buffer)
    return buffer.getvalue()


def _ajustar_largura_colunas(aba: Worksheet, colunas: Sequence[str], linhas: Sequence[Sequence[Any]]) -> None:
    for indice, cabecalho in enumerate(colunas, start=1):
        maior = len(str(cabecalho))
        for linha in linhas:
            if indice - 1 < len(linha):
                maior = max(maior, len(str(linha[indice - 1])))
        aba.column_dimensions[get_column_letter(indice)].width = min(maior + 2, _LARGURA_MAXIMA_COLUNA)
