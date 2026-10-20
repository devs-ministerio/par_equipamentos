"""Substitui só download/HTTP; contratos e classificação são os reais."""

import csv
import io
import json
from hashlib import sha256
from pathlib import Path

import pytest
import requests
from pydantic import ValidationError

from app.domain_errors import ConflictError
from app.pipeline.contratos_externos import RespostaExternaInvalidaError
from app.pipeline.portal_transparencia import ChaveApiAusenteError, settings
from app.schemas_coleta_recaptura_legado import AlvoRecapturaLegado
from app.schemas_filhas_legado import ARQUIVOS_FILHAS, CHAVES_FILHAS
from scripts import coletar_recaptura_legado as coletor
from tests.test_coletor_siconv_integridade import zip_siconv
from tests.test_prova_recaptura_legado import dados as dados


def csv_zip(linhas, campos):
    texto = io.StringIO(newline="")
    nomes = list(dict.fromkeys([*campos, *(chave for linha in linhas for chave in linha)]))
    escritor = csv.DictWriter(texto, fieldnames=nomes, delimiter=";")
    escritor.writeheader()
    escritor.writerows(linhas)
    return zip_siconv(texto.getvalue())


@pytest.fixture
def fontes(monkeypatch, dados):
    arquivos = {
        "siconv_convenio": csv_zip([dados["convenio"]], ["NR_CONVENIO", "ID_PROPOSTA"]),
        "siconv_proposta": csv_zip([dados["proposta"]], ["ID_PROPOSTA", "COD_ORGAO_SUP"]),
        "siconv_plano_aplicacao": csv_zip(dados["itens"], ["ID_PROPOSTA", "ID_ITEM_PAD", "DESCRICAO_ITEM"]),
        "siconv_programa_proposta": csv_zip([], ["ID_PROPOSTA", "ID_PROGRAMA"]),
        "siconv_programa": csv_zip([], ["ID_PROGRAMA", "NOME_PROGRAMA", "COD_ORGAO_SUP_PROGRAMA"]),
    }
    for campo, nome in ARQUIVOS_FILHAS.items():
        chave = "ID_SOLICITACAO" if campo == "termos_aditivos" else CHAVES_FILHAS[campo]
        arquivos[nome] = csv_zip([], ["NR_CONVENIO", chave])
    chamadas = []
    caches = []
    resposta_portal = {"corpo": dados["portal"], "status": 200}

    def baixar(nome, *, atualizar_cache=False, diretorio_cache=None):
        assert atualizar_cache is True
        assert isinstance(diretorio_cache, Path) and diretorio_cache.is_dir()
        chamadas.append(nome)
        caches.append(diretorio_cache)
        return arquivos[nome]

    def consultar(sessao, url, *, params, headers, timeout):
        assert url.endswith("/convenios/numero") and params == {"numero": "999001"}
        assert headers == {"chave-api-dados": "chave-sintetica"} and timeout == 30
        chamadas.append("portal")
        resposta = requests.Response()
        resposta.status_code = resposta_portal["status"]
        resposta._content = json.dumps(resposta_portal["corpo"], ensure_ascii=False).encode()
        return resposta

    monkeypatch.setattr(settings, "portal_transparencia_api_key", "chave-sintetica")
    monkeypatch.setattr(coletor, "_baixar_zip", baixar)
    monkeypatch.setattr(requests.Session, "get", consultar)
    return arquivos, chamadas, caches, resposta_portal


def alvo():
    return AlvoRecapturaLegado(candidato_id=1, captura_id=1, numero="999001", id_proposta="111001")


def test_coleta_completa_hashes_literais_privacidade_e_limpeza(fontes):
    arquivos, chamadas, caches, portal = fontes
    portal["corpo"]["emailResponsavel"] = "pessoa@instituicao.example"
    pacote = coletor.coletar_recaptura(alvo())
    assert len(chamadas) == 11 and set(chamadas) == {*arquivos, "portal"}
    assert pacote.captura.convenio.SIT_CONVENIO == "Em execução"
    assert pacote.captura.convenio.VL_GLOBAL_CONV == "1000,50"
    assert pacote.origem.hash_convenios == sha256(arquivos["siconv_convenio"]).hexdigest()
    assert pacote.origem.hashes_filhas == {
        campo: sha256(arquivos[nome]).hexdigest() for campo, nome in ARQUIVOS_FILHAS.items()
    }
    assert pacote.origem.payload_protegido_local is True
    assert "pessoa@instituicao.example" not in pacote.captura.model_dump_json()
    assert all(not cache.exists() for cache in caches)
    assert all(not getattr(pacote.captura.filhas, campo) for campo in CHAVES_FILHAS)


@pytest.mark.parametrize(
    "natureza", ["Curso de acelerador linear", "Construção do hospital com área construída e braquiterapia"]
)
def test_curso_e_obra_nao_consultam_financeiro(fontes, natureza):
    arquivos, chamadas, caches, _ = fontes
    arquivos["siconv_plano_aplicacao"] = csv_zip(
        [{"ID_PROPOSTA": "111001", "ID_ITEM_PAD": "1", "DESCRICAO_ITEM": natureza}], []
    )
    with pytest.raises(ConflictError, match="não comprova"):
        coletor.coletar_recaptura(alvo())
    assert not set(ARQUIVOS_FILHAS.values()).intersection(chamadas) and "portal" not in chamadas
    assert all(not cache.exists() for cache in caches)


def test_outro_orgao_nao_habilita_coleta_financeira(fontes):
    arquivos, chamadas, *_ = fontes
    arquivos["siconv_proposta"] = csv_zip([{"ID_PROPOSTA": "111001", "COD_ORGAO_SUP": "99999"}], [])
    with pytest.raises(ConflictError):
        coletor.coletar_recaptura(alvo())
    assert not set(ARQUIVOS_FILHAS.values()).intersection(chamadas)


@pytest.mark.parametrize("defeito", ["ausente", "duplicado", "identidade"])
def test_principal_nao_pode_estar_ausente_ambiguo_ou_trocado(fontes, dados, defeito):
    arquivos, chamadas, *_ = fontes
    linhas = [] if defeito == "ausente" else [dados["convenio"], dados["convenio"]]
    if defeito == "identidade":
        linhas = [{**dados["convenio"], "ID_PROPOSTA": "222002"}]
    arquivos["siconv_convenio"] = csv_zip(linhas, ["NR_CONVENIO", "ID_PROPOSTA"])
    with pytest.raises(ConflictError, match="Identidade"):
        coletor.coletar_recaptura(alvo())
    assert not set(ARQUIVOS_FILHAS.values()).intersection(chamadas)


@pytest.mark.parametrize("defeito", ["404", "multiplo", "outro", "incompleto"])
def test_portal_invalido_bloqueia_antes_das_filhas(fontes, dados, defeito):
    _, chamadas, caches, portal = fontes
    if defeito == "404":
        portal["status"] = 404
    elif defeito == "multiplo":
        portal["corpo"] = [dados["portal"], dados["portal"]]
    elif defeito == "outro":
        portal["corpo"]["dimConvenio"]["codigo"] = 999002
    else:
        portal["corpo"] = {"dimConvenio": {"codigo": 999001}}
    with pytest.raises((ConflictError, ValidationError, RespostaExternaInvalidaError)):
        coletor.coletar_recaptura(alvo())
    assert not set(ARQUIVOS_FILHAS.values()).intersection(chamadas)
    assert all(not cache.exists() for cache in caches)


def test_chave_ausente_nao_baixa_arquivos(fontes, monkeypatch):
    _, chamadas, *_ = fontes
    monkeypatch.setattr(settings, "portal_transparencia_api_key", "")
    with pytest.raises(ChaveApiAusenteError):
        coletor.coletar_recaptura(alvo())
    assert chamadas == []


def test_coluna_ausente_nao_pode_ser_interpretada_como_colecao_vazia(fontes):
    arquivos, _, caches, _ = fontes
    arquivos["siconv_pagamento"] = csv_zip([], ["NR_CONVENIO"])
    with pytest.raises(ValueError, match="colunas obrigatórias"):
        coletor.coletar_recaptura(alvo())
    assert all(not cache.exists() for cache in caches)


def test_erro_em_linha_fora_do_recorte_tambem_invalida_snapshot(fontes):
    arquivos, *_ = fontes
    arquivos["siconv_empenho"] = zip_siconv("NR_CONVENIO;ID_EMPENHO\n999999;1;campo indevido\n")
    with pytest.raises(ValueError, match="truncada ou ambígua"):
        coletor.coletar_recaptura(alvo())


def test_estorno_e_termos_com_mesma_solicitacao_preservados(fontes):
    arquivos, *_ = fontes
    arquivos["siconv_pagamento"] = csv_zip([{"NR_CONVENIO": "999001", "NR_MOV_FIN": "1", "VL_PAGO": "-10,50"}], [])
    arquivos["siconv_termo_aditivo"] = csv_zip(
        [{"NR_CONVENIO": "999001", "ID_SOLICITACAO": "7", "NUMERO_TA": n} for n in ("1", "2")], []
    )
    pacote = coletor.coletar_recaptura(alvo())
    assert pacote.captura.filhas.pagamentos[0].VL_PAGO == "-10,50"
    assert len({t.CHAVE_ESPELHO for t in pacote.captura.filhas.termos_aditivos}) == 2


def test_limite_seguro_recusa_excesso_sem_truncar_e_sem_consultar_filhas(fontes):
    arquivos, chamadas, caches, _ = fontes
    arquivos["siconv_plano_aplicacao"] = csv_zip(
        [{"ID_PROPOSTA": "111001", "ID_ITEM_PAD": str(n), "DESCRICAO_ITEM": "Mamógrafo"} for n in range(10_001)], []
    )
    with pytest.raises(ValueError, match="limite seguro"):
        coletor.coletar_recaptura(alvo())
    assert not set(ARQUIVOS_FILHAS.values()).intersection(chamadas)
    assert all(not cache.exists() for cache in caches)
