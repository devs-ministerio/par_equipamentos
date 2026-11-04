"""Resumo de acompanhamento nos Dados oficiais (D17): regra pura de conferência cronológica."""

from datetime import date

from app.services.monitoramento_acompanhamento import conferencia_cronologica


def test_entrega_depois_da_inauguracao_pede_conferencia_sem_corrigir_datas():
    texto = conferencia_cronologica(date(2022, 3, 17), date(2022, 4, 29))
    assert texto is not None
    assert "29/04/2022" in texto and "17/03/2022" in texto


def test_sequencia_coerente_ou_incompleta_nao_gera_conferencia():
    assert conferencia_cronologica(date(2022, 4, 29), date(2022, 3, 17)) is None
    assert conferencia_cronologica(None, date(2022, 4, 29)) is None
    assert conferencia_cronologica(date(2022, 3, 17), None) is None
