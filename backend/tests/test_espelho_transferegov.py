import pytest

from app.services.espelho_transferegov import reconciliar_arvore, resumir_mudancas
from app.services.evidencias_transferegov import extrair_evidencias_relacionais


def test_itens_alterados_e_novos_sao_comparados_por_id_nao_por_posicao():
    anterior = {
        "metas": [
            {
                "id_meta_proposta": 1,
                "etapas_proposta": [
                    {
                        "id_etapa_proposta": 2,
                        "itens": [
                            {"id_item_proposta": 3, "nm_item": "Tomógrafo", "vl_total_item": 100},
                            {"id_item_proposta": 4, "nm_item": "Ressonância"},
                        ],
                    }
                ],
            }
        ]
    }
    atual = {
        "metas": [
            {
                "id_meta_proposta": 1,
                "etapas_proposta": [
                    {
                        "id_etapa_proposta": 2,
                        "itens": [
                            {"id_item_proposta": 4, "nm_item": "Ressonância"},
                            {"id_item_proposta": 3, "vl_total_item": 120},
                            {"id_item_proposta": 5, "nm_item": "Mamógrafo"},
                        ],
                    }
                ],
            }
        ]
    }
    confirmado, mudancas = reconciliar_arvore(anterior, atual)
    resumo = resumir_mudancas(mudancas)
    assert "itens[3].vl_total_item: 100 → 120" in resumo
    assert "itens[5].nm_item" in resumo
    assert "itens[4]" not in resumo
    assert reconciliar_arvore(confirmado, atual)[1] == []
    assert anterior["metas"][0]["etapas_proposta"][0]["itens"][0]["vl_total_item"] == 100


def test_omissoes_nulos_e_lista_vazia_preservam_ultimo_confirmado():
    anterior = {
        "proposta": {"ds_objeto": "Equipamento", "vl_total": 100},
        "timeline_financeira": {"ordens_pagamento": [{"id_op": 7, "in_situacao_op": "Paga"}]},
    }
    atual = {"proposta": {"ds_objeto": None}, "timeline_financeira": {"ordens_pagamento": []}}
    assert reconciliar_arvore(anterior, atual) == (anterior, [])


@pytest.mark.parametrize("registros", [[{"nm_item": "Sem id"}], [{"id_item_proposta": 1}, {"id_item_proposta": 1}]])
def test_identidade_ambigua_e_rejeitada_sem_inferir_correspondencia(registros):
    with pytest.raises(ValueError):
        reconciliar_arvore({}, {"itens": registros})


def test_ordens_e_cronogramas_usam_identificador_proprio_antes_do_pai():
    evidencias = extrair_evidencias_relacionais(
        {
            "proposta": {"id_proposta": 1},
            "cronograma_desembolso": [
                {"id_proposta_cronograma_item": 2, "id_proposta": 1},
                {"id_proposta_cronograma_item": 3, "id_proposta": 1},
            ],
            "parceria": {"id_parceria": 4},
            "timeline_financeira": {
                "ordens_pagamento": [
                    {"id_op": 5, "id_documento_habil": 7},
                    {"id_op": 6, "id_documento_habil": 7},
                ]
            },
        }
    )
    assert [e.chave_externa for e in evidencias if e.tipo_recurso == "ordem-pagamento"] == ["5", "6"]
    assert [e.chave_externa for e in evidencias if e.tipo_recurso == "cronograma-desembolso"] == ["2", "3"]
