"""Só HTTP é simulado: transferência, retomada, tamanhos, CRC e cache reais."""

import re

import pytest
import requests

from scripts import coletar_siconv_legado as coletor
from scripts import download_siconv as download
from tests.test_coletar_siconv_cache import RespostaZip, zip_valido


class RespostaParcial(RespostaZip):
    def __init__(self, corpo, inicio, fim, total):
        super().__init__(corpo)
        self.status_code = 206
        self.headers = {
            "ETag": '"versao-a"',
            "Content-Range": f"bytes {inicio}-{fim}/{total}",
            "Content-Length": str(len(corpo)),
        }
        self.falha = False
        self.fechada = False

    def __exit__(self, *_):
        self.fechada = True

    def iter_content(self, *, chunk_size):
        if self.falha:
            yield self.conteudo[:3]
            raise requests.exceptions.ChunkedEncodingError("interrupção sintética")
        yield self.conteudo

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError("status sintético")


@pytest.fixture
def fonte(monkeypatch):
    conteudo = zip_valido(b"CSV sintetico integral; " * 20)
    chamadas = []
    respostas = []
    urls = []
    alterar = {"funcao": lambda resposta, numero: None}
    monkeypatch.setattr(download, "TAMANHO_PARTE", 64)

    def get(sessao, url, *, stream, timeout, headers):
        urls.append(url)
        assert all(valor == urls[0] for valor in urls)
        assert stream and timeout == coletor.TIMEOUT
        assert headers["Accept-Encoding"] == "identity" and headers["Cache-Control"] == "no-cache"
        intervalo = re.fullmatch(r"bytes=([0-9]+)-([0-9]+)", headers["Range"])
        assert intervalo is not None
        inicio, fim = map(int, intervalo.groups())
        if inicio:
            assert headers["If-Range"] == '"versao-a"'
        fim = min(fim, len(conteudo) - 1)
        resposta = RespostaParcial(conteudo[inicio : fim + 1], inicio, fim, len(conteudo))
        chamadas.append(inicio)
        alterar["funcao"](resposta, len(chamadas))
        respostas.append(resposta)
        return resposta

    monkeypatch.setattr(requests.Session, "get", get)
    return conteudo, chamadas, respostas, alterar


def test_partes_exatas_mesmo_etag_geram_zip_identico_e_crc_valido(tmp_path, fonte):
    # Arrange
    esperado, chamadas, respostas, _ = fonte
    # Act
    recebido = coletor._baixar_zip("siconv_proposta", atualizar_cache=True, diretorio_cache=tmp_path)
    # Assert
    assert recebido == esperado
    assert chamadas == list(range(0, len(esperado), 64))
    assert all(r.fechada for r in respostas)
    assert {p.name for p in tmp_path.iterdir()} == {"siconv_proposta.csv.zip"}


def test_queda_repete_so_parte_afetada_sem_duplicar_bytes(tmp_path, fonte):
    # Arrange
    esperado, chamadas, respostas, alterar = fonte

    def interromper(resposta, numero):
        resposta.falha = numero == 2

    alterar["funcao"] = interromper
    # Act
    recebido = coletor._baixar_zip("siconv_proposta", atualizar_cache=True, diretorio_cache=tmp_path)
    # Assert
    assert recebido == esperado and chamadas[:4] == [0, 64, 64, 128]
    assert all(r.fechada for r in respostas)


@pytest.mark.parametrize(
    "defeito",
    [
        "etag",
        "total",
        "inicio",
        "sem_range",
        "sem_etag",
        "fraco",
        "corpo_curto",
        "corpo_longo",
        "tamanho",
        "encoding",
        "ignora_range",
        "416",
    ],
)
def test_resposta_inconsistente_nunca_substitui_cache(tmp_path, fonte, defeito):
    # Arrange
    _, chamadas, respostas, alterar = fonte
    antigo = zip_valido(b"ultima-versao-confirmada")
    cache = tmp_path / "siconv_proposta.csv.zip"
    cache.write_bytes(antigo)

    def adulterar(resposta, numero):
        if numero != 2:
            return
        if defeito == "etag":
            resposta.headers["ETag"] = '"versao-b"'
        elif defeito == "total":
            resposta.headers["Content-Range"] = resposta.headers["Content-Range"].rsplit("/", 1)[0] + "/99999"
        elif defeito == "inicio":
            resposta.headers["Content-Range"] = "bytes 0-63/99999"
        elif defeito == "sem_range":
            resposta.headers.pop("Content-Range")
        elif defeito == "sem_etag":
            resposta.headers.pop("ETag")
        elif defeito == "fraco":
            resposta.headers["ETag"] = 'W/"versao-a"'
        elif defeito == "corpo_curto":
            resposta.conteudo = resposta.conteudo[:-1]
        elif defeito == "corpo_longo":
            resposta.conteudo += b"x"
        elif defeito == "tamanho":
            resposta.headers["Content-Length"] = "999"
        elif defeito == "encoding":
            resposta.headers["Content-Encoding"] = "gzip"
        elif defeito == "ignora_range":
            resposta.status_code = 200
        else:
            resposta.status_code = 416

    alterar["funcao"] = adulterar
    # Act / Assert
    with pytest.raises((ValueError, requests.HTTPError)):
        coletor._baixar_zip("siconv_proposta", atualizar_cache=True, diretorio_cache=tmp_path)
    assert cache.read_bytes() == antigo and chamadas == [0, 64]
    assert all(r.fechada for r in respostas)
    assert set(tmp_path.iterdir()) == {cache}


def test_tres_falhas_na_mesma_parte_nao_reiniciam_arquivo_todo(tmp_path, fonte):
    # Arrange
    _, chamadas, respostas, alterar = fonte
    antigo = zip_valido(b"confirmado")
    cache = tmp_path / "siconv_proposta.csv.zip"
    cache.write_bytes(antigo)

    def interromper(resposta, numero):
        resposta.falha = numero > 1

    alterar["funcao"] = interromper
    # Act / Assert
    with pytest.raises(download.DownloadSegmentadoInterrompidoError):
        coletor._baixar_zip("siconv_proposta", atualizar_cache=True, diretorio_cache=tmp_path)
    assert chamadas == [0, 64, 64, 64] and cache.read_bytes() == antigo
    assert all(r.fechada for r in respostas) and set(tmp_path.iterdir()) == {cache}


def test_prazo_total_encerra_antes_de_nova_requisicao(tmp_path, fonte, monkeypatch):
    # Arrange
    monkeypatch.setattr(download, "LIMITE_SEGUNDOS", 0)
    # Act / Assert
    with pytest.raises(TimeoutError, match="prazo total"):
        coletor._baixar_zip("siconv_proposta", atualizar_cache=True, diretorio_cache=tmp_path)
    assert fonte[1] == [] and list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("etag", [None, "0x8DF123", 'W/"versao-a"'])
def test_primeira_parte_sem_validador_forte_exige_novo_get_integral(tmp_path, monkeypatch, etag):
    esperado = zip_valido(b"fonte-atual" * 30)
    chamadas = []
    urls = []
    parcial = RespostaParcial(esperado[:64], 0, 63, len(esperado))
    parcial.headers.pop("ETag")
    if etag is not None:
        parcial.headers["ETag"] = etag
    monkeypatch.setattr(download, "TAMANHO_PARTE", 64)

    def get(sessao, url, *, stream, timeout, headers):
        urls.append(url)
        assert all(valor == urls[0] for valor in urls)
        chamadas.append(headers)
        if len(chamadas) == 1:
            return parcial
        assert parcial.fechada
        assert "Range" not in headers and "If-Range" not in headers
        resposta = RespostaZip(esperado)
        resposta.headers["Content-Length"] = str(len(esperado))
        return resposta

    monkeypatch.setattr(requests.Session, "get", get)
    recebido = coletor._baixar_zip("siconv_proposta", atualizar_cache=True, diretorio_cache=tmp_path)
    assert recebido == esperado and len(chamadas) == 2
    assert {p.name for p in tmp_path.iterdir()} == {"siconv_proposta.csv.zip"}


@pytest.mark.parametrize("defeito", ["parcial", "encoding", "truncado"])
def test_fallback_integral_invalido_preserva_cache(tmp_path, monkeypatch, defeito):
    esperado = zip_valido(b"fonte-atual" * 30)
    antigo = zip_valido(b"anterior")
    cache = tmp_path / "siconv_proposta.csv.zip"
    cache.write_bytes(antigo)
    chamadas = []
    monkeypatch.setattr(download, "TAMANHO_PARTE", 64)

    def get(sessao, url, *, stream, timeout, headers):
        chamadas.append(headers)
        if len(chamadas) == 1:
            parcial = RespostaParcial(esperado[:64], 0, 63, len(esperado))
            parcial.headers["ETag"] = "0x8DF123"
            return parcial
        resposta = RespostaZip(esperado[:-1] if defeito == "truncado" else esperado)
        resposta.headers["Content-Length"] = str(len(esperado))
        if defeito == "parcial":
            resposta.status_code = 206
        elif defeito == "encoding":
            resposta.headers["Content-Encoding"] = "gzip"
        return resposta

    monkeypatch.setattr(requests.Session, "get", get)
    with pytest.raises(ValueError):
        coletor._baixar_zip("siconv_proposta", atualizar_cache=True, diretorio_cache=tmp_path)
    assert len(chamadas) == 2 and cache.read_bytes() == antigo
    assert set(tmp_path.iterdir()) == {cache}
