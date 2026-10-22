"""A verificação recorrente não pode reutilizar um ZIP SICONV antigo."""

import io
import zipfile
from pathlib import Path

import pytest
import requests

from scripts import coletar_siconv_legado


class RespostaZip:
    def __init__(self, conteudo: bytes):
        self.conteudo = conteudo
        self.status_code = 200
        self.headers: dict[str, str] = {}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def raise_for_status(self):
        return None

    def iter_content(self, *, chunk_size: int):
        assert chunk_size > 0
        yield self.conteudo


class SessaoFonte:
    def __init__(self, conteudo: bytes):
        self.chamadas = 0
        self.conteudo = conteudo
        self.fechada = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.fechada = True

    def get(self, *_args, **_kwargs):
        self.chamadas += 1
        return RespostaZip(self.conteudo)


def zip_valido(conteudo: bytes) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as arquivo:
        arquivo.writestr("siconv_convenio.csv", conteudo)
    return buffer.getvalue()


def test_atualizar_cache_substitui_versao_local_sem_reutilizar_dado_antigo(tmp_path: Path, monkeypatch):
    nova_versao = zip_valido(b"versao-atual")
    sessao = SessaoFonte(nova_versao)
    monkeypatch.setattr(coletar_siconv_legado, "DIR_CACHE", tmp_path)
    monkeypatch.setattr(coletar_siconv_legado, "_sessao_com_retry", lambda: sessao)
    cache = tmp_path / "siconv_convenio.csv.zip"
    cache.write_bytes(b"versao-antiga")

    conteudo = coletar_siconv_legado._baixar_zip("siconv_convenio", atualizar_cache=True)

    assert conteudo == nova_versao
    assert cache.read_bytes() == nova_versao
    assert sessao.chamadas == 1
    assert sessao.fechada is True


def test_importacao_historica_pode_reutilizar_cache_sem_chamar_fonte(tmp_path: Path, monkeypatch):
    sessao = SessaoFonte(zip_valido(b"versao-atual"))
    monkeypatch.setattr(coletar_siconv_legado, "DIR_CACHE", tmp_path)
    monkeypatch.setattr(coletar_siconv_legado, "_sessao_com_retry", lambda: sessao)
    (tmp_path / "siconv_convenio.csv.zip").write_bytes(b"versao-antiga")

    conteudo = coletar_siconv_legado._baixar_zip("siconv_convenio")

    assert conteudo == b"versao-antiga"
    assert sessao.chamadas == 0
    assert sessao.fechada is False


def test_zip_truncado_nao_sobrescreve_cache_anterior(tmp_path: Path, monkeypatch):
    sessao = SessaoFonte(b"download-incompleto")
    monkeypatch.setattr(coletar_siconv_legado, "DIR_CACHE", tmp_path)
    monkeypatch.setattr(coletar_siconv_legado, "_sessao_com_retry", lambda: sessao)
    cache = tmp_path / "siconv_convenio.csv.zip"
    cache.write_bytes(zip_valido(b"versao-anterior"))

    with pytest.raises(zipfile.BadZipFile):
        coletar_siconv_legado._baixar_zip("siconv_convenio", atualizar_cache=True)

    assert cache.read_bytes() == zip_valido(b"versao-anterior")
    assert not (tmp_path / "siconv_convenio.csv.zip.tmp").exists()
    assert sessao.fechada is True


def test_cache_privado_da_recaptura_nao_toca_cache_compartilhado(tmp_path: Path, monkeypatch):
    sessao = SessaoFonte(zip_valido(b"versao-atual"))
    compartilhado, privado = tmp_path / "compartilhado", tmp_path / "privado"
    compartilhado.mkdir()
    anterior = compartilhado / "siconv_convenio.csv.zip"
    anterior.write_bytes(b"cache-anterior")
    monkeypatch.setattr(coletar_siconv_legado, "DIR_CACHE", compartilhado)
    monkeypatch.setattr(coletar_siconv_legado, "_sessao_com_retry", lambda: sessao)
    conteudo = coletar_siconv_legado._baixar_zip("siconv_convenio", atualizar_cache=True, diretorio_cache=privado)
    assert (privado / "siconv_convenio.csv.zip").read_bytes() == conteudo == sessao.conteudo
    assert anterior.read_bytes() == b"cache-anterior" and sessao.fechada is True


class RespostaInterrompida(RespostaZip):
    def __init__(self, erro):
        super().__init__(b"prefixo-incompleto")
        self.erro = erro

    def iter_content(self, *, chunk_size: int):
        yield self.conteudo
        raise self.erro


def respostas_sequenciais(monkeypatch, respostas):
    sessoes: list[SessaoFonte] = []

    def criar():
        resposta = respostas[len(sessoes)]
        sessao = SessaoFonte(b"")
        monkeypatch.setattr(sessao, "get", lambda *_args, **_kwargs: resposta)
        sessoes.append(sessao)
        return sessao

    monkeypatch.setattr(coletar_siconv_legado, "_sessao_com_retry", criar)
    return sessoes


@pytest.mark.parametrize("erro", [requests.exceptions.ChunkedEncodingError, requests.ConnectionError, requests.Timeout])
def test_queda_no_corpo_reinicia_download_sem_anexar_bytes_parciais(tmp_path, monkeypatch, erro):
    # Arrange: o corpo começa a chegar, mas a primeira conexão é interrompida.
    novo = zip_valido(b"versao-integra")
    sessoes = respostas_sequenciais(monkeypatch, [RespostaInterrompida(erro()), RespostaZip(novo)])
    cache = tmp_path / "siconv_convenio.csv.zip"
    cache.write_bytes(b"anterior-preservado-ate-validacao")
    # Act
    recebido = coletar_siconv_legado._baixar_zip("siconv_convenio", atualizar_cache=True, diretorio_cache=tmp_path)
    # Assert
    assert recebido == cache.read_bytes() == novo
    assert len(sessoes) == 2 and all(sessao.fechada for sessao in sessoes)
    assert set(tmp_path.iterdir()) == {cache}


@pytest.mark.parametrize("com_cache", [True, False])
def test_tres_quedas_encerram_sem_publicar_parcial_ou_apagar_cache(tmp_path, monkeypatch, com_cache):
    # Arrange
    sessoes = respostas_sequenciais(
        monkeypatch, [RespostaInterrompida(requests.exceptions.ChunkedEncodingError()) for _ in range(3)]
    )
    cache = tmp_path / "siconv_convenio.csv.zip"
    if com_cache:
        cache.write_bytes(b"anterior")
    # Act / Assert
    with pytest.raises(requests.exceptions.ChunkedEncodingError):
        coletar_siconv_legado._baixar_zip("siconv_convenio", atualizar_cache=com_cache, diretorio_cache=tmp_path)
    assert len(sessoes) == 3 and all(sessao.fechada for sessao in sessoes)
    assert set(tmp_path.iterdir()) == ({cache} if com_cache else set())
    if com_cache:
        assert cache.read_bytes() == b"anterior"


def test_primeiro_download_zip_invalido_nao_vira_cache_valido(tmp_path, monkeypatch):
    # Arrange
    sessoes = respostas_sequenciais(monkeypatch, [RespostaZip(b"truncado")])
    # Act / Assert
    with pytest.raises(zipfile.BadZipFile):
        coletar_siconv_legado._baixar_zip("siconv_convenio", diretorio_cache=tmp_path)
    assert len(sessoes) == 1 and sessoes[0].fechada
    assert list(tmp_path.iterdir()) == []


def test_erro_http_nao_e_repetido_como_queda_do_corpo(tmp_path, monkeypatch):
    # Arrange: retry de status HTTP pertence ao adaptador, não ao corpo.
    resposta = RespostaZip(b"")

    def rejeitar():
        raise requests.HTTPError("fixture")

    monkeypatch.setattr(resposta, "raise_for_status", rejeitar)
    sessoes = respostas_sequenciais(monkeypatch, [resposta])
    # Act / Assert
    with pytest.raises(requests.HTTPError):
        coletar_siconv_legado._baixar_zip("siconv_convenio", diretorio_cache=tmp_path)
    assert len(sessoes) == 1 and sessoes[0].fechada
    assert list(tmp_path.iterdir()) == []
