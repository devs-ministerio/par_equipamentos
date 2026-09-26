"""app/reports/formatacao.py -- formatação pt-BR pro Word (Plan Mode
docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 5)."""

from __future__ import annotations

from datetime import date

from app.reports.formatacao import formatar_data, formatar_moeda


def test_formatar_moeda_valores_positivos():
    assert formatar_moeda(1234.5) == "R$ 1.234,50"
    assert formatar_moeda(0.0) == "R$ 0,00"
    assert formatar_moeda(1_000_000.99) == "R$ 1.000.000,99"


def test_formatar_moeda_none_e_travessao():
    assert formatar_moeda(None) == "—"


def test_formatar_data():
    assert formatar_data(date(2026, 9, 26)) == "26/09/2026"


def test_formatar_data_none_e_travessao():
    assert formatar_data(None) == "—"
