"""Testa a conta de cobertura (RN da Metodologia: 1 equipamento por 100 mil
habitantes, denominador de oferta = in_use_qty-onde-sus_flag, equipamento
em uso e SUS) isolada de banco e das APIs externas -- extraida em
app/pipeline/cobertura.py justamente pra poder ser testada assim.
"""
from app.db.models import DeficitStatus
from app.pipeline.cobertura import calcular_cobertura, populacao_sus_dependente


def test_sus_dependente_subtrai_ans_do_residente():
    assert populacao_sus_dependente(residente=21165, ans=3205) == 17960


def test_sus_dependente_nunca_negativa():
    # residente (SIDRA, ao vivo) e ans (arquivo de referencia) sao fontes/
    # vintages diferentes -- ans pode superar o residente do ano corrente.
    assert populacao_sus_dependente(residente=100, ans=500) == 0


def test_sus_dependente_sem_beneficiario_ans_e_o_residente_inteiro():
    assert populacao_sus_dependente(residente=5000, ans=0) == 5000


def test_demanda_arredonda_pra_cima():
    # 150_001 habitantes / 100_000 = 1,50001 -> exige 2, nao 1 (ceil, nao
    # round nem floor -- uma fracao de demanda ainda e demanda real).
    r = calcular_cobertura(population=150_001, in_use_sus=2)
    assert r.required_qty == 2


def test_macro_sem_populacao_nunca_fica_em_deficit():
    # RN-05: macro sem match no SIDRA ainda aparece, com demanda zero --
    # balance = oferta - 0 >= 0 sempre, entao nunca deficit por falta de
    # dado de populacao (deficit so quando ha demanda real descoberta).
    r = calcular_cobertura(population=0, in_use_sus=0)
    assert r.required_qty == 0
    assert r.balance == 0
    assert r.deficit_status == DeficitStatus.not_deficient


def test_deficit_quando_oferta_menor_que_demanda():
    r = calcular_cobertura(population=1_000_000, in_use_sus=5)
    assert r.required_qty == 10
    assert r.balance == -5
    assert r.deficit_status == DeficitStatus.deficient


def test_nao_deficit_quando_oferta_cobre_exatamente():
    r = calcular_cobertura(population=500_000, in_use_sus=5)
    assert r.required_qty == 5
    assert r.balance == 0
    assert r.deficit_status == DeficitStatus.not_deficient


def test_produtividade_customizavel():
    # so TOMOGRAFO usa 100_000 hoje, mas a funcao nao pode assumir isso --
    # outras familias (Fase 2) terao produtividade diferente.
    r = calcular_cobertura(population=1_000_000, in_use_sus=1, produtividade=500_000)
    assert r.required_qty == 2
    assert r.balance == -1
