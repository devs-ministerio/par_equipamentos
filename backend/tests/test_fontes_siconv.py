"""Não voltar silenciosamente ao repositório oficial descontinuado."""

from urllib.parse import parse_qs, urlsplit

import pytest
import requests

from scripts import coletar_siconv_legado as coletor
from scripts.fontes_siconv import url_arquivo
from tests.test_coletar_siconv_cache import RespostaZip, SessaoFonte, zip_valido


@pytest.mark.parametrize(
    "nome,remoto",
    [
        ("siconv_convenio", "siconv_convenio"),
        ("siconv_proposta", "siconv_proposta"),
        ("siconv_plano_aplicacao", "siconv_plano_aplicacao_detalhado"),
        ("siconv_programa_proposta", "siconv_programa_proposta"),
        ("siconv_programa", "siconv_programa"),
        ("siconv_empenho", "siconv_empenho"),
        ("siconv_desembolso", "siconv_desembolso"),
        ("siconv_licitacao", "siconv_licitacao"),
        ("siconv_termo_aditivo", "siconv_termo_aditivo"),
        ("siconv_pagamento", "siconv_pagamento"),
        ("data_carga_siconv", "data_carga_siconv"),
    ],
)
def test_catalogo_oficial_atual(nome, remoto):
    assert url_arquivo(nome) == f"https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov/{remoto}.zip"


@pytest.mark.parametrize("nome", ["../siconv_convenio", "desconhecido", "https://outra-fonte/arquivo"])
def test_arquivo_fora_do_catalogo_nao_tem_fallback(nome):
    with pytest.raises(ValueError, match="não cadastrado"):
        url_arquivo(nome)


def test_nome_fora_do_catalogo_e_recusado_antes_de_ler_cache(tmp_path):
    antigo = tmp_path / "desconhecido.csv.zip"
    antigo.write_bytes(zip_valido(b"nao utilizar"))
    with pytest.raises(ValueError, match="não cadastrado"):
        coletor._baixar_zip("desconhecido", diretorio_cache=tmp_path)


def test_cache_atual_nao_reutiliza_nem_remove_zip_do_endpoint_antigo(tmp_path, monkeypatch):
    assert coletor.DIR_CACHE.name == "transferegov_atual"
    antigo = tmp_path / "siconv_convenio.csv.zip"
    antigo.write_bytes(zip_valido(b"julho"))
    novo = zip_valido(b"outubro")
    sessao = SessaoFonte(novo)
    monkeypatch.setattr(coletor, "DIR_CACHE", tmp_path / "transferegov_atual")
    monkeypatch.setattr(coletor, "_sessao_com_retry", lambda: sessao)
    assert coletor._baixar_zip("siconv_convenio") == novo
    assert sessao.chamadas == 1 and antigo.read_bytes() != novo


def test_rodadas_novas_nao_reutilizam_url_cacheada_pelo_proxy(tmp_path, monkeypatch):
    urls = []
    corpo = zip_valido(b"captura atual")

    def get(sessao, url, **kwargs):
        urls.append(url)
        assert kwargs["headers"]["Cache-Control"] == "no-cache"
        return RespostaZip(corpo)

    monkeypatch.setattr(requests.Session, "get", get)
    for _ in range(2):
        assert coletor._baixar_zip("siconv_convenio", atualizar_cache=True, diretorio_cache=tmp_path) == corpo
    assert len(urls) == 2 and urls[0] != urls[1]
    for url in urls:
        partes = urlsplit(url)
        assert partes.scheme == "https" and partes.netloc == "api-publica.transferegov.gestao.gov.br"
        assert partes.path == "/downloads/dadosgov/siconv_convenio.zip"
        query = parse_qs(partes.query)
        assert set(query) == {"sigeo_snapshot"}
        assert len(query["sigeo_snapshot"][0]) == 32
