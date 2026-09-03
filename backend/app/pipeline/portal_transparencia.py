"""Cliente da API do Portal da Transparencia -- usado pra consultar
convenios/instrumentos de repasse pelo numero legado do SICONV.

Por que nao usar a API nova do TransfereGov (`api-publica.transferegov.
gestao.gov.br/parcerias`): aquela API so cobre o modulo Gestao de Parcerias
(instrumentos novos, com id_proposta/id_parceria pequenos, ex. 86) -- nao
tem campo nenhum de "numero de convenio" legado. Os numeros de convenio
antigos (SICONV, 6 digitos, ex. 904824) vivem no modulo Discricionarias e
Legais do TransfereGov, que so oferece download de CSV bulk por enquanto
(sem API de consulta por numero -- ver docs/transferegov-investsus.md).

O Portal da Transparencia tem exatamente esse endpoint de consulta pontual
por numero: GET /api-de-dados/convenios/numero?numero=<numero>. Exige um
header `chave-api-dados` -- chave GRATUITA de autoatendimento (login gov.br,
sem aprovacao manual), gerada em
https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email. Le de
`settings.portal_transparencia_api_key` (nunca hardcoded).

Confirmado ao vivo (2026-09-03): sem a chave o endpoint devolve 401
Unauthorized (nao e 403/paywall -- so falta credencial, que qualquer
usuario gov.br gera na hora).
"""
from __future__ import annotations

from typing import Any, TypedDict

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.config import settings

BASE_URL = "https://api.portaldatransparencia.gov.br/api-de-dados"
TIMEOUT = 30


class ChaveApiAusenteError(RuntimeError):
    """`portal_transparencia_api_key` nao configurada em settings/.env."""


class ConvenioNaoEncontradoError(RuntimeError):
    """Numero de convenio nao existe na base do Portal da Transparencia
    (404 ou lista vazia) -- distinto de erro de rede/autenticacao."""


def _sessao_com_retry() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3, backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def _headers() -> dict[str, str]:
    if not settings.portal_transparencia_api_key:
        raise ChaveApiAusenteError(
            "PORTAL_TRANSPARENCIA_API_KEY nao configurada. Gere uma chave gratuita "
            "(login gov.br) em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email "
            "e defina no .env."
        )
    return {"chave-api-dados": settings.portal_transparencia_api_key}


def buscar_convenio_por_numero(numero: str | int, session: requests.Session | None = None) -> dict[str, Any] | None:
    """Consulta um convenio pelo numero (ex. 904824). Devolve o dict cru da
    API (primeiro item da lista, quando existe) ou None se a API responder
    404/lista vazia -- nao levanta excecao pra "nao encontrado", so pra erro
    de fato (rede, auth). Chamador decide o que fazer com None."""
    session = session or _sessao_com_retry()
    resp = session.get(
        f"{BASE_URL}/convenios/numero",
        params={"numero": str(numero)},
        headers=_headers(),
        timeout=TIMEOUT,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    # A API manda Content-Type sem charset, e o requests cai no default
    # (ISO-8859-1) pra decodificar antes do .json() -- mangla acento
    # ("PRESTAÇÃO" virava "PRESTA��O"). O corpo e UTF-8 de verdade
    # (confirmado inspecionando resp.content bruto); forcar aqui.
    resp.encoding = "utf-8"
    corpo = resp.json()
    if isinstance(corpo, list):
        return corpo[0] if corpo else None
    return corpo or None


class ResultadoConsulta(TypedDict):
    numero: str
    encontrado: bool
    dado: dict[str, Any] | None
    erro: str | None


def validar_convenios(numeros: list[str | int]) -> list[ResultadoConsulta]:
    """Consulta uma lista de numeros de convenio em sequencia (a API do
    Portal da Transparencia nao documenta busca em lote pra esse endpoint,
    so por numero individual). Erros de rede/auth num numero nao interrompem
    os demais -- ficam registrados em `erro` pra essa linha."""
    session = _sessao_com_retry()
    resultados: list[ResultadoConsulta] = []
    for numero in numeros:
        try:
            dado = buscar_convenio_por_numero(numero, session=session)
            resultados.append(ResultadoConsulta(
                numero=str(numero), encontrado=dado is not None, dado=dado, erro=None,
            ))
        except ChaveApiAusenteError:
            raise  # configuracao ausente afeta tudo -- nao faz sentido seguir tentando
        except requests.RequestException as e:
            resultados.append(ResultadoConsulta(
                numero=str(numero), encontrado=False, dado=None, erro=str(e),
            ))
    return resultados
