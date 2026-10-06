"""A verificação recorrente não pode reutilizar um ZIP SICONV antigo."""

import io
import zipfile
from pathlib import Path

import pytest

from scripts import coletar_siconv_legado


class RespostaZip:
    def __init__(self, conteudo: bytes):
        self.conteudo = conteudo

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


def test_importacao_historica_pode_reutilizar_cache_sem_chamar_fonte(tmp_path: Path, monkeypatch):
    sessao = SessaoFonte(zip_valido(b"versao-atual"))
    monkeypatch.setattr(coletar_siconv_legado, "DIR_CACHE", tmp_path)
    monkeypatch.setattr(coletar_siconv_legado, "_sessao_com_retry", lambda: sessao)
    (tmp_path / "siconv_convenio.csv.zip").write_bytes(b"versao-antiga")

    conteudo = coletar_siconv_legado._baixar_zip("siconv_convenio")

    assert conteudo == b"versao-antiga"
    assert sessao.chamadas == 0


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
