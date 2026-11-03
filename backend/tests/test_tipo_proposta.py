"""Tipo de contratação da proposta, resolvido no backend (D03): regras puras."""

from app.pipeline.tipo_proposta import evidencia_fundo_a_fundo, tipo_da_proposta

FAF = {"metas": [{"descricao": "Normas de Cooperação Financeira na modalidade Fundo a Fundo, aprovada pela Portaria"}]}


def test_evidencia_reconhece_a_modalidade_oficial():
    assert evidencia_fundo_a_fundo(FAF)
    assert not evidencia_fundo_a_fundo({"item": "operando em modalidade dual CHANNEL"})
    assert not evidencia_fundo_a_fundo(None)


def test_tipo_segue_programa_oficial_e_evidencia():
    assert tipo_da_proposta("Pronon - Serviços médico-assistenciais", fundo_a_fundo=False) == "PRONON"
    assert tipo_da_proposta("ATENÇÃO ESPECIALIZADA EM SAÚDE", fundo_a_fundo=True) == "FAF"
    assert tipo_da_proposta("ATENÇÃO ESPECIALIZADA EM SAÚDE", fundo_a_fundo=False) == "Parceria TransfereGov"
