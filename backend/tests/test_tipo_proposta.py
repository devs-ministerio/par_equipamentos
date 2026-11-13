"""Tipo de contratação da proposta, resolvido no backend (D03): regras puras."""

from app.pipeline.tipo_proposta import tipo_da_proposta


def test_pronon_segue_o_programa_oficial_e_o_resto_e_faf():
    assert tipo_da_proposta("Pronon - Serviços médico-assistenciais") == "PRONON"
    assert tipo_da_proposta("ATENÇÃO ESPECIALIZADA EM SAÚDE") == "FAF"
    assert tipo_da_proposta(None) == "FAF"
