"""Itens de obra e serviço não contam como equipamento, nem em quantidade nem em valor."""

import pytest

from app.pipeline.itens_plano import descricoes_so_de_obra_ou_servico, item_conta_como_equipamento
from app.services.relatorios import _valores_por_item_plano
from app.services.relatorios_encerrados import _quantidade_de_equipamentos


@pytest.mark.parametrize(
    ("item", "esperado"),
    [
        ({"TIPO_DESPESA_ITEM": "BEM"}, True),
        ({"TIPO_DESPESA_ITEM": "OUTROS"}, True),
        ({}, True),  # carga manual de PERSUS/FAF/TED não tem tipo
        ({"TIPO_DESPESA_ITEM": "OBRA"}, False),
        ({"TIPO_DESPESA_ITEM": " servico "}, False),
        ("texto", False),
    ],
)
def test_item_conta_como_equipamento(item, esperado):
    assert item_conta_como_equipamento(item) is esperado


def test_descricao_que_tambem_existe_em_item_de_bem_nao_e_so_de_obra():
    itens = [
        {"DESCRICAO_ITEM": "Tomógrafo", "TIPO_DESPESA_ITEM": "OBRA"},
        {"DESCRICAO_ITEM": "Tomógrafo", "TIPO_DESPESA_ITEM": "BEM"},
        {"DESCRICAO_ITEM": "Reforma com ressonância", "TIPO_DESPESA_ITEM": "OBRA"},
    ]
    assert descricoes_so_de_obra_ou_servico(itens) == {"Reforma com ressonância"}


def test_quantidade_ignora_area_de_obra_e_servico():
    # Given: item de obra com área em m² que menciona PET/CT, e um mamógrafo de verdade
    itens = [
        {"DESCRICAO_ITEM": "Reforma do setor de PET/CT", "QTD_ITEM": "2296", "TIPO_DESPESA_ITEM": "OBRA"},
        {"DESCRICAO_ITEM": "Mamógrafo digital", "QTD_ITEM": "2", "TIPO_DESPESA_ITEM": "BEM"},
    ]
    # Then
    assert _quantidade_de_equipamentos(itens, ["mamografo"]) == 2
    assert _quantidade_de_equipamentos(itens, ["pet_ct"]) == 1  # só a obra evidencia: cai no padrão de um por tipo


def test_carga_manual_vale_uma_unidade_e_duplicata_so_de_caixa_conta_uma_vez():
    itens = [
        {"DESCRICAO_ITEM": "Acelerador Linear", "ORIGEM_ITEM": "carga_manual_inicial"},
        {"DESCRICAO_ITEM": "Acelerador linear", "ORIGEM_ITEM": "carga_manual_inicial"},
    ]
    assert _quantidade_de_equipamentos(itens, ["acelerador_linear"]) == 1


def test_item_oficial_numerado_continua_somando():
    itens = [
        {"DESCRICAO_ITEM": "Ultrassom 1", "ID_ITEM_PAD": "1", "QTD_ITEM": "2", "TIPO_DESPESA_ITEM": "BEM"},
        {"DESCRICAO_ITEM": "Ultrassom 2", "ID_ITEM_PAD": "2", "QTD_ITEM": "3", "TIPO_DESPESA_ITEM": "BEM"},
    ]
    assert _quantidade_de_equipamentos(itens, ["ultrassom"]) == 5


def test_valor_do_plano_nao_inclui_o_valor_da_obra():
    class Fake:
        siconv_raw = {
            "itens_plano_aplicacao": [
                {
                    "DESCRICAO_ITEM": "Reforma com tomógrafo",
                    "VALOR_TOTAL_ITEM": "163906479,00",
                    "TIPO_DESPESA_ITEM": "OBRA",
                },
                {"DESCRICAO_ITEM": "Tomógrafo", "VALOR_TOTAL_ITEM": "1000000,00", "TIPO_DESPESA_ITEM": "BEM"},
            ]
        }

    assert _valores_por_item_plano(Fake()) == {"Tomógrafo": 1_000_000.0}  # type: ignore[arg-type]
