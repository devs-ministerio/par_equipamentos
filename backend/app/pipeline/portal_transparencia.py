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

from collections.abc import Sequence
from typing import Any, TypedDict

import requests
from pydantic import BaseModel, ConfigDict
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.config import settings
from app.observability import executar_chamada_externa
from app.pipeline.contratos_externos import validar_lista_objetos_externos, validar_objeto_externo

BASE_URL = "https://api.portaldatransparencia.gov.br/api-de-dados"
TIMEOUT = 30


class ConvenioPortalTransparencia(BaseModel):
    """Campos efetivamente consumidos; extras são preservados como evidência."""

    model_config = ConfigDict(extra="allow")

    situacao: str | None = None
    valor: float | None = None
    valorLiberado: float | None = None
    valorContrapartida: float | None = None
    valorDaUltimaLiberacao: float | None = None


def _validar_convenio_portal(dado: dict[str, Any]) -> ConvenioPortalTransparencia:
    return ConvenioPortalTransparencia.model_validate(dado)


class ChaveApiAusenteError(RuntimeError):
    """`portal_transparencia_api_key` nao configurada em settings/.env."""


class ConvenioNaoEncontradoError(RuntimeError):
    """Numero de convenio nao existe na base do Portal da Transparencia
    (404 ou lista vazia) -- distinto de erro de rede/autenticacao."""


def _sessao_com_retry() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=2,
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


def buscar_convenio_por_numero_dto(
    numero: str | int, session: requests.Session | None = None
) -> ConvenioPortalTransparencia | None:
    """Consulta tipada do convênio; ``None`` representa 404/lista vazia."""
    session = session or _sessao_com_retry()
    resp = executar_chamada_externa(
        fonte="Portal da Transparência",
        operacao="convenio_por_numero",
        chamada=lambda: session.get(
            f"{BASE_URL}/convenios/numero",
            params={"numero": str(numero)},
            headers=_headers(),
            timeout=TIMEOUT,
        ),
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
        itens = validar_lista_objetos_externos(corpo, fonte="Portal da Transparência")
        return _validar_convenio_portal(itens[0]) if itens else None
    if corpo is None:
        return None
    return _validar_convenio_portal(validar_objeto_externo(corpo, fonte="Portal da Transparência"))


def buscar_convenio_por_numero(numero: str | int, session: requests.Session | None = None) -> dict[str, Any] | None:
    """Adaptador de compatibilidade para cargas que ainda montam JSON cru."""
    convenio = buscar_convenio_por_numero_dto(numero, session=session)
    return convenio.model_dump() if convenio is not None else None


class ResultadoConsulta(TypedDict):
    numero: str
    encontrado: bool
    dado: dict[str, Any] | None
    erro: str | None


def validar_convenios(numeros: Sequence[str | int]) -> list[ResultadoConsulta]:
    """Consulta uma lista de numeros de convenio em sequencia (a API do
    Portal da Transparencia nao documenta busca em lote pra esse endpoint,
    so por numero individual). Erros de rede/auth num numero nao interrompem
    os demais -- ficam registrados em `erro` pra essa linha."""
    session = _sessao_com_retry()
    resultados: list[ResultadoConsulta] = []
    for numero in numeros:
        try:
            dado = buscar_convenio_por_numero(numero, session=session)
            resultados.append(
                ResultadoConsulta(
                    numero=str(numero),
                    encontrado=dado is not None,
                    dado=dado,
                    erro=None,
                )
            )
        except ChaveApiAusenteError:
            raise  # configuracao ausente afeta tudo -- nao faz sentido seguir tentando
        except requests.RequestException as e:
            resultados.append(
                ResultadoConsulta(
                    numero=str(numero),
                    encontrado=False,
                    dado=None,
                    erro=str(e),
                )
            )
    return resultados
