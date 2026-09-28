"""Formatação pt-BR pra exibição em relatório (Plan Mode docs/arquitetura/
planmode-relatorios-2026-09-25.md, Bloco 5) -- usada só no Word (texto puro
em tabela/parágrafo); no Excel o valor cru é preservado (sortável/somável)
e a aparência vem de `Worksheet.cell.number_format`, ver `xlsx_builder.py`.
"""

from __future__ import annotations

from datetime import date


def formatar_moeda(valor: float | None) -> str:
    if valor is None:
        return "—"
    inteiro_e_decimal = f"{valor:,.2f}"
    # f-string usa separador americano (1,234.56) -- troca pra pt-BR
    # (1.234,56) via placeholder, sem depender de locale do processo.
    return "R$ " + inteiro_e_decimal.replace(",", "_").replace(".", ",").replace("_", ".")


def formatar_data(valor: date | None) -> str:
    return "—" if valor is None else valor.strftime("%d/%m/%Y")
