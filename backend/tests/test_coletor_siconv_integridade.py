"""Somente o download é substituído; ZIP, CSV e seleção são os reais."""

import io
from zipfile import ZipFile

import pytest

from scripts import coletar_siconv_legado as coletor


def zip_siconv(texto: str, *, nome: str = "origem_detalhada.csv", extra: bool = False) -> bytes:
    memoria = io.BytesIO()
    with ZipFile(memoria, "w") as arquivo:
        arquivo.writestr(nome, texto.encode("utf-8-sig"))
        if extra:
            arquivo.writestr("outro.csv", "NR_CONVENIO\n825374\n")
    return memoria.getvalue()


def fonte_sintetica(monkeypatch, texto: str, **opcoes):
    recebido = zip_siconv(texto, **opcoes)
    pedidos = []

    def baixar(nome, *, atualizar_cache=False):
        pedidos.append((nome, atualizar_cache))
        return recebido

    monkeypatch.setattr(coletor, "_baixar_zip", baixar)
    return pedidos


def test_estado_literal_acentos_multilinha_e_filtro_exato(monkeypatch):
    # Arrange: CSV válido, incluindo texto citado; não normalizar a situação.
    pedidos = fonte_sintetica(
        monkeypatch,
        "NR_CONVENIO;SIT_CONVENIO;OBJETO\n"
        '825374;Prestação de Contas Concluída;"Aquisição; equipamento\noncológico"\n'
        "8253740;Outra situação;Outro convênio\n",
    )
    # Act
    registros = coletor._filtrar_por_numero_convenio("siconv_convenio", {"825374"}, atualizar_cache=True)
    # Assert
    assert registros == [
        {
            "NR_CONVENIO": "825374",
            "SIT_CONVENIO": "Prestação de Contas Concluída",
            "OBJETO": "Aquisição; equipamento\noncológico",
        }
    ]
    assert pedidos == [("siconv_convenio", True)]


@pytest.mark.parametrize(
    "texto",
    [
        "NR_CONVENIO;SIT_CONVENIO\n825374\n",
        "NR_CONVENIO;SIT_CONVENIO\n825374;Em execução;coluna indevida\n",
        'NR_CONVENIO;SIT_CONVENIO\n825374;"texto sem fechar\n',
        "NR_CONVENIO;NR_CONVENIO\n825374;825374\n",
        "NR_CONVENIO;\n825374;valor\n",
        "",
    ],
)
def test_fonte_integra_e_obrigatoria_sem_descartar_ou_reparar_linha(monkeypatch, texto):
    # Arrange
    fonte_sintetica(monkeypatch, texto)
    # Act / Assert
    with pytest.raises((ValueError, coletor.csv.Error)):
        coletor._filtrar_por_numero_convenio("siconv_convenio", {"825374"})


@pytest.mark.parametrize("opcoes", [{"extra": True}, {"nome": "origem.txt"}])
def test_zip_ambiguo_ou_sem_csv_nao_vira_primeiro_arquivo_arbitrario(monkeypatch, opcoes):
    # Arrange
    fonte_sintetica(monkeypatch, "NR_CONVENIO\n825374\n", **opcoes)
    # Act / Assert
    with pytest.raises(ValueError, match="exatamente um CSV"):
        coletor._filtrar_por_numero_convenio("siconv_convenio", {"825374"})


def test_justificativa_historica_de_termo_preserva_ponto_e_virgula(monkeypatch):
    # Arrange
    fonte_sintetica(
        monkeypatch,
        "NR_CONVENIO;ID_SOLICITACAO;NUMERO_TA;JUSTIFICATIVA_TA\n825374;7;2;Prorrogação; prazo; preservado\n",
    )
    # Act
    registros = coletor._filtrar_por_numero_convenio("siconv_termo_aditivo", {"825374"})
    # Assert
    assert registros == [
        {
            "NR_CONVENIO": "825374",
            "ID_SOLICITACAO": "7",
            "NUMERO_TA": "2",
            "JUSTIFICATIVA_TA": "Prorrogação; prazo; preservado",
        }
    ]


def test_excecao_de_justificativa_nao_desloca_outros_campos(monkeypatch):
    # Arrange: JUSTIFICATIVA_TA não é o último campo.
    fonte_sintetica(monkeypatch, "NR_CONVENIO;JUSTIFICATIVA_TA;NUMERO_TA\n825374;Texto; solto;2\n")
    # Act / Assert
    with pytest.raises(ValueError, match="ambígua"):
        coletor._filtrar_por_numero_convenio("siconv_termo_aditivo", {"825374"})


def test_plano_nao_pula_linha_truncada_mesmo_fora_da_amostra(monkeypatch):
    # Arrange: corrupção fora da amostra também impede certificar o arquivo.
    fonte_sintetica(monkeypatch, "ID_PROPOSTA;ID_ITEM_PAD;DESCRICAO_ITEM\n111001;1;Mamógrafo\n111002;2\n")
    # Act / Assert
    with pytest.raises(ValueError, match="truncada"):
        coletor._filtrar_plano_aplicacao_por_id_proposta({"111001"})


def test_plano_preserva_apenas_itens_da_identidade_solicitada(monkeypatch):
    # Arrange
    pedidos = fonte_sintetica(
        monkeypatch, "ID_PROPOSTA;ID_ITEM_PAD;DESCRICAO_ITEM\n111001;1;Mamógrafo\n1110010;2;Outro\n"
    )
    # Act
    registros = coletor._filtrar_plano_aplicacao_por_id_proposta({"111001"}, atualizar_cache=True)
    # Assert
    assert registros == [{"ID_PROPOSTA": "111001", "ID_ITEM_PAD": "1", "DESCRICAO_ITEM": "Mamógrafo"}]
    assert pedidos == [("siconv_plano_aplicacao", True)]


def test_amostra_vazia_nao_baixa_arquivo_nacional(monkeypatch):
    # Arrange
    pedidos = fonte_sintetica(monkeypatch, "não deve ser lido")
    # Act / Assert
    assert coletor._filtrar_por_numero_convenio("siconv_pagamento", set()) == []
    assert coletor._filtrar_plano_aplicacao_por_id_proposta(set()) == []
    assert coletor._filtrar_programa_proposta_por_id_proposta(set()) == {}
    assert coletor._filtrar_programa_por_id(set()) == {}
    assert pedidos == []
