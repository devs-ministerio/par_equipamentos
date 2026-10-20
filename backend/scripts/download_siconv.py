"""Transferência HTTP limitada e verificável; publicação/CRC ficam no coletor.

Range/If-Range seguem RFC 9110 §14 e §13.1.5. Só junta partes com ETag forte igual,
intervalos exatos e tamanho total estável. Não confunde consulta com frescor.
"""

import re
from dataclasses import dataclass
from pathlib import Path
from time import monotonic
from typing import BinaryIO

import requests

TAMANHO_PARTE = 4 * 1024 * 1024
LIMITE_ARQUIVO = 6 * 1024**3
LIMITE_SEGUNDOS = 20 * 60
FALHAS_TRANSPORTE = (requests.exceptions.ChunkedEncodingError, requests.ConnectionError, requests.Timeout)


class DownloadSegmentadoInterrompidoError(RuntimeError):
    """Três falhas na mesma parte; não reiniciar silenciosamente todo o ZIP."""


class SemValidadorForteError(ValueError):
    """Só permite fallback integral antes de qualquer parte confirmada."""


@dataclass(frozen=True)
class IntervaloHttp:
    inicio: int
    fim: int
    total: int
    etag: str | None


def _tamanho(resp: requests.Response) -> int | None:
    valor = resp.headers.get("Content-Length")
    if valor is None:
        return None
    if not valor.isascii() or not valor.isdigit() or int(valor) > LIMITE_ARQUIVO:
        raise ValueError("Tamanho HTTP ausente de integridade ou acima do limite seguro.")
    return int(valor)


def _intervalo(resp: requests.Response, inicio: int) -> IntervaloHttp:
    if resp.status_code != 206:
        raise ValueError("Resposta HTTP não confirma a parte solicitada.")
    match = re.fullmatch(r"bytes ([0-9]+)-([0-9]+)/([0-9]+)", resp.headers.get("Content-Range", ""))
    if match is None:
        raise ValueError("Fonte retornou intervalo HTTP inválido.")
    primeiro, ultimo, total = map(int, match.groups())
    if not 0 < total <= LIMITE_ARQUIVO or primeiro != inicio or ultimo != min(inicio + TAMANHO_PARTE - 1, total - 1):
        raise ValueError("Intervalo HTTP não corresponde à parte solicitada.")
    tamanho = _tamanho(resp)
    if tamanho is not None and tamanho != ultimo - primeiro + 1:
        raise ValueError("Tamanho HTTP diverge do intervalo declarado.")
    etag = resp.headers.get("ETag")
    if total > TAMANHO_PARTE and (etag is None or re.fullmatch(r'"[^"\r\n]*"', etag) is None):
        raise SemValidadorForteError("Fonte não comprova versão forte para juntar partes do arquivo.")
    return IntervaloHttp(primeiro, ultimo, total, etag)


def _copiar(resp: requests.Response, destino: BinaryIO, esperado: int | None, prazo: float) -> None:
    escritos = 0
    for bloco in resp.iter_content(chunk_size=64 * 1024):
        if monotonic() >= prazo:
            raise TimeoutError("Download excedeu o prazo total seguro.")
        escritos += len(bloco)
        if escritos > LIMITE_ARQUIVO or (esperado is not None and escritos > esperado):
            raise ValueError("Corpo HTTP excedeu o tamanho declarado.")
        destino.write(bloco)
    if esperado is not None and escritos != esperado:
        raise ValueError("Corpo HTTP incompleto; nenhum snapshot foi publicado.")


def _transferir_partes(*, url: str, destino: Path, sessao: requests.Session, timeout: int, prazo: float) -> None:
    inicio = 0
    intervalo: IntervaloHttp | None = None
    parcial = False
    with destino.open("wb") as arquivo:
        while intervalo is None or inicio < intervalo.total:
            for tentativa in range(3):
                if monotonic() >= prazo:
                    raise TimeoutError("Download excedeu o prazo total seguro.")
                arquivo.seek(inicio)
                arquivo.truncate()
                headers = {
                    "User-Agent": "Mozilla/5.0",
                    "Accept-Encoding": "identity",
                    "Cache-Control": "no-cache",
                    "Range": f"bytes={inicio}-{inicio + TAMANHO_PARTE - 1}",
                }
                if intervalo is not None and intervalo.etag is not None:
                    headers["If-Range"] = intervalo.etag
                try:
                    with sessao.get(url, stream=True, timeout=timeout, headers=headers) as resp:
                        resp.raise_for_status()
                        if resp.headers.get("Content-Encoding", "identity").casefold() not in ("", "identity"):
                            raise ValueError("Fonte ignorou codificação identity; partes não serão combinadas.")
                        if resp.status_code == 200:
                            if parcial or inicio:
                                raise ValueError("Fonte mudou de versão ou ignorou a retomada; snapshot descartado.")
                            _copiar(resp, arquivo, _tamanho(resp), prazo)
                            return  # Fonte ignora Range: corpo integral e CRC, sem juntar partes.
                        parcial = True
                        try:
                            atual = _intervalo(resp, inicio)
                        except SemValidadorForteError:
                            if intervalo is not None:
                                raise ValueError("Fonte perdeu o validador de versão durante a retomada.") from None
                            raise
                        if intervalo is not None and (atual.total, atual.etag) != (intervalo.total, intervalo.etag):
                            raise ValueError("Versão ou tamanho da fonte mudou durante o download.")
                        intervalo = atual
                        _copiar(resp, arquivo, atual.fim - atual.inicio + 1, prazo)
                    break
                except FALHAS_TRANSPORTE as erro:
                    if not parcial:
                        raise  # Fallback 200 mantém o retry integral do coletor.
                    if tentativa == 2:
                        raise DownloadSegmentadoInterrompidoError("Parte indisponível após três tentativas.") from erro
            inicio = arquivo.tell()


def transferir_zip(*, url: str, destino: Path, sessao: requests.Session, timeout: int) -> None:
    prazo = monotonic() + LIMITE_SEGUNDOS
    try:
        _transferir_partes(url=url, destino=destino, sessao=sessao, timeout=timeout, prazo=prazo)
    except SemValidadorForteError:
        # Proxy oficial atual publica ETag sem aspas e não confirma If-Range.
        # Não inventar validador nem concatenar partes: novo GET integral.
        if monotonic() >= prazo:
            raise TimeoutError("Download excedeu o prazo total seguro.") from None
        with sessao.get(
            url,
            stream=True,
            timeout=timeout,
            headers={"User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity", "Cache-Control": "no-cache"},
        ) as resp:
            resp.raise_for_status()
            if resp.status_code != 200 or resp.headers.get("Content-Encoding", "identity").casefold() not in (
                "",
                "identity",
            ):
                raise ValueError("Fonte não confirmou transferência integral íntegra.")
            with destino.open("wb") as arquivo:
                _copiar(resp, arquivo, _tamanho(resp), prazo)
