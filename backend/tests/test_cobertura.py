"""Testa a conta de cobertura (RN da Metodologia: 1 equipamento por 100 mil
habitantes, denominador de oferta = existing_qty-onde-sus_flag / D-02)
isolada de banco e das APIs externas -- extraida em
app/pipeline/cobertura.py justamente pra poder ser testada assim.
"""
from app.db.models import DeficitStatus
from app.pipeline.cobertura import calcular_cobertura


def test_demanda_arredonda_pra_cima():
    # 150_001 habitantes / 100_000 = 1,50001 -> exige 2, nao 1 (ceil, nao
    # round nem floor -- uma fracao de demanda ainda e demanda real).
    r = calcular_cobertura(population=150_001, existing_sus=2)
    assert r.required_qty == 2


def test_macro_sem_populacao_nunca_fica_em_deficit():
    # RN-05: macro sem match no SIDRA ainda aparece, com demanda zero --
    # balance = oferta - 0 >= 0 sempre, entao nunca deficit por falta de
    # dado de populacao (deficit so quando ha demanda real descoberta).
    r = calcular_cobertura(population=0, existing_sus=0)
    assert r.required_qty == 0
    assert r.balance == 0
    assert r.deficit_status == DeficitStatus.not_deficient


def test_deficit_quando_oferta_menor_que_demanda():
    r = calcular_cobertura(population=1_000_000, existing_sus=5)
    assert r.required_qty == 10
    assert r.balance == -5
    assert r.deficit_status == DeficitStatus.deficient


def test_nao_deficit_quando_oferta_cobre_exatamente():
    r = calcular_cobertura(population=500_000, existing_sus=5)
    assert r.required_qty == 5
    assert r.balance == 0
    assert r.deficit_status == DeficitStatus.not_deficient


def test_produtividade_customizavel():
    # so TOMOGRAFO usa 100_000 hoje, mas a funcao nao pode assumir isso --
    # outras familias (Fase 2) terao produtividade diferente.
    r = calcular_cobertura(population=1_000_000, existing_sus=1, produtividade=500_000)
    assert r.required_qty == 2
    assert r.balance == -1
