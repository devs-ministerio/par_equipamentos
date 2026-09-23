from app.services.evidencias_transferegov import extrair_evidencias_relacionais


def test_achata_arvore_com_caminhos_e_ancestralidade_consultaveis():
    evidencias = extrair_evidencias_relacionais(
        {
            "proposta": {"id_proposta": 42, "ds_objeto": "Equipamento"},
            "metas": [
                {
                    "id_meta_proposta": 7,
                    "etapas_proposta": [
                        {"id_etapa_proposta": 9, "itens": [{"id_item_proposta": 11, "nm_item": "Tomógrafo"}]}
                    ],
                }
            ],
            "cronograma_desembolso": [{"id_cronograma_desembolso": 5}],
            "analise": [],
            "distribuicao_recurso": [],
            "parceria": {"id_parceria": 13},
            "timeline_financeira": {
                "contas": [{"id_parceria_conta": 17}],
                "empenhos": [{"id_empenho_parceria": 19}],
                "documentos_habeis": [{"id_documento_habil": 23}],
                "ordens_pagamento": [{"id_ordem_pagamento": 29}],
            },
        }
    )

    por_caminho = {evidencia.caminho: evidencia for evidencia in evidencias}
    item = por_caminho["proposta:42/meta-proposta:7/etapa-proposta:9/item-proposta:11"]
    assert item.caminho_pai == "proposta:42/meta-proposta:7/etapa-proposta:9"
    assert item.tipo_recurso == "item-proposta"
    assert por_caminho["proposta:42/parceria:13/ordem-pagamento:29"].chave_externa == "29"


def test_chave_por_posicao_mantem_evidencia_sem_identificador_publico():
    evidencias = extrair_evidencias_relacionais(
        {"proposta": {"id_proposta": 42}, "metas": [{"nm_meta": "Sem id"}]}
    )

    assert evidencias[1].caminho == "proposta:42/meta-proposta:1"
