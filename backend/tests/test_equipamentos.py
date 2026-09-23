from __future__ import annotations

from app.db.models import Convenio
from app.equipamentos import classificar_descricoes
from scripts.lib_monitoramento_convenio import adicionar_item_manual_inicial


def test_classificador_reconhece_multiplos_equipamentos_e_preserva_evidencia():
    achados = classificar_descricoes(
        [
            "Aquisição de acelerador linear com IGRT 3D e mamógrafo digital.",
        ]
    )

    assert [(item.nome, item.relacao) for item in achados] == [
        ("Acelerador Linear", "aquisicao"),
        ("Mamógrafo", "aquisicao"),
    ]


def test_classificador_canoniza_linac_e_grafia_acelerado_como_acelerador_prioritario():
    achados = classificar_descricoes(["AQUISIÇÃO DE LINAC E ACELERADO LINEAR PARA RADIOTERAPIA"])

    assert [(item.codigo, item.nome) for item in achados] == [
        ("acelerador_linear", "Acelerador Linear"),
        ("radioterapia", "Radioterapia"),
    ]


def test_classificador_distingue_modernizacao_de_aquisicao_nova():
    achados = classificar_descricoes(["Upgrade do acelerador linear existente."])

    assert len(achados) == 1
    assert achados[0].nome == "Acelerador Linear"
    assert achados[0].relacao == "modernizacao"


def test_objeto_narrativo_nao_vira_aquisicao_quando_chamador_declara_mencao():
    achados = classificar_descricoes(
        ["Melhoria do atendimento de radioterapia com acelerador linear."],
        relacao_padrao="mencao",
    )

    assert [(item.nome, item.relacao) for item in achados] == [
        ("Acelerador Linear", "mencao"),
        ("Radioterapia", "mencao"),
    ]


def test_classificador_reconhece_citometro_de_fluxo():
    achados = classificar_descricoes(["011410-Citômetro de Fluxo (até 6 parâmetros)"])

    assert [(item.codigo, item.nome) for item in achados] == [("citometro_fluxo", "Citômetro de Fluxo")]


def test_item_nao_prioritario_fora_do_catalogo_tambem_gera_marcador():
    achados = classificar_descricoes(["011417-Foco Cirúrgico de Teto com Câmera de Vídeo"])

    assert len(achados) == 1
    assert achados[0].codigo.startswith("item_plano_")
    assert achados[0].nome == "Foco Cirúrgico de Teto com Câmera de Vídeo"


def test_item_manual_entra_na_mesma_colecao_de_itens_do_plano_sem_duplicar():
    convenio = Convenio(numero="manual-1", siconv_raw={"itens_plano_aplicacao": [{"DESCRICAO_ITEM": "Item API"}]})

    adicionar_item_manual_inicial(convenio, "011410-Citômetro de Fluxo (até 6 parâmetros)", "planilha FAF/TED")
    adicionar_item_manual_inicial(convenio, "011410-Citômetro de Fluxo (até 6 parâmetros)", "planilha FAF/TED")

    assert convenio.siconv_raw == {
        "itens_plano_aplicacao": [
            {"DESCRICAO_ITEM": "Item API"},
            {
                "DESCRICAO_ITEM": "011410-Citômetro de Fluxo (até 6 parâmetros)",
                "ORIGEM_ITEM": "carga_manual_inicial",
                "FONTE_ITEM": "planilha FAF/TED",
            },
        ]
    }
