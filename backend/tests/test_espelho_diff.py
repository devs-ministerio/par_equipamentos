import pytest

from app.services.espelho_diff import diff_campos, diff_lista, mesclar_lista, mesmo_valor


def test_sem_baseline_nao_ha_diferenca():
    assert diff_campos(None, {"A": "1"}) == {}
    assert diff_lista(None, [{"ID": "1"}], "ID").vazio


def test_campo_novo_sem_baseline_e_campo_ausente_na_resposta_nao_geram_mudanca():
    assert diff_campos({"A": "1", "B": "2"}, {"A": "1", "C": "3"}) == {}
    assert diff_campos({"A": "1"}, {"A": "2"}) == {"A": ("1", "2")}


def test_lista_detecta_adicionado_alterado_e_ausente_sem_apagar():
    antigo = [{"ID": "1", "V": "10"}, {"ID": "2", "V": "20"}, {"ID": "3", "V": "30"}]
    novo = [{"ID": "1", "V": "10"}, {"ID": "2", "V": "25"}, {"ID": "4", "V": "40"}]
    diff = diff_lista(antigo, novo, "ID")
    assert [r["ID"] for r in diff.adicionados] == ["4"]
    assert diff.alterados == [("2", {"V": ("20", "25")})]
    assert diff.ausentes == ["3"]
    mesclada = mesclar_lista(antigo, novo, "ID")
    assert [r["ID"] for r in mesclada] == ["1", "2", "3", "4"]
    assert mesclada[1]["V"] == "25" and mesclada[2]["V"] == "30"


def test_mesclar_preserva_itens_sem_chave_e_reexecucao_e_idempotente():
    manual = {"DESCRICAO_ITEM": "x", "ORIGEM_ITEM": "manual"}
    antigo = [manual, {"ID": "1", "V": "1"}]
    novo = [{"ID": "1", "V": "1"}]
    primeira = mesclar_lista(antigo, novo, "ID")
    assert primeira == antigo
    assert mesclar_lista(primeira, novo, "ID") == primeira
    assert diff_lista(primeira, novo, "ID").vazio


def test_resposta_parcial_preserva_campos_anteriores_do_item():
    antigo = [{"ID": "1", "V": "10", "DATA": "01/01/2026"}]
    novo = [{"ID": "1", "V": "20"}]
    assert mesclar_lista(antigo, novo, "ID") == [{"ID": "1", "V": "20", "DATA": "01/01/2026"}]


def test_chave_duplicada_divergente_nao_colapsa_pagamentos_silenciosamente():
    pagamentos = [{"ID": "1", "V": "10"}, {"ID": "1", "V": "20"}]
    with pytest.raises(ValueError, match="duplicada"):
        mesclar_lista([], pagamentos, "ID")


def test_registro_novo_sem_chave_nao_e_descartado_silenciosamente():
    with pytest.raises(ValueError, match="chave obrigatória"):
        mesclar_lista([], [{"V": "10"}], "ID")


def test_zeros_a_esquerda_em_numero_nao_contam_como_mudanca():
    assert diff_campos({"NR_LICITACAO": "15"}, {"NR_LICITACAO": "015"}) == {}
    assert diff_campos({"UG": "000000"}, {"UG": "0"}) == {}
    assert diff_campos({"NR": "03"}, {"NR": "0003"}) == {}


def test_mudanca_real_de_numero_continua_sendo_avisada():
    assert diff_campos({"NR": "03"}, {"NR": "04"}) == {"NR": ("03", "04")}
    assert diff_campos({"NR": "0"}, {"NR": "10"}) == {"NR": ("0", "10")}


def test_zero_a_esquerda_so_vale_para_texto_apenas_numerico():
    assert not mesmo_valor("0123-4", "123-4")
    assert not mesmo_valor("010,50", "10,50")
    assert not mesmo_valor("A01", "A1")
    assert not mesmo_valor("", "0")
    assert mesmo_valor("00", "0")


def test_lista_so_com_zeros_a_esquerda_nao_gera_alteracao():
    antigo = [{"ID": "1", "NR_LICITACAO": "15"}]
    novo = [{"ID": "1", "NR_LICITACAO": "015"}]
    assert diff_lista(antigo, novo, "ID").vazio
