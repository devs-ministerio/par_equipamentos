"""Observabilidade HTTP sem registrar dados sensíveis de requisição."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from time import perf_counter
from typing import TypeVar
from uuid import uuid4

from fastapi import Request

logger = logging.getLogger("sigeo.http")
T = TypeVar("T")
_TRACE_ID_REGEX = re.compile(r"^[0-9a-f]{32}$")


def _trace_id_aceitavel(trace_id: str | None) -> str:
    """Aceita somente o identificador opaco gerado pelo cliente.

    O valor é enviado de volta ao log para correlacionar uma chamada de tela
    com a API. Validá-lo impede que um cabeçalho arbitrário vire conteúdo de
    telemetria ou de log.
    """
    if trace_id is not None and _TRACE_ID_REGEX.fullmatch(trace_id):
        return trace_id
    return uuid4().hex


def executar_chamada_externa(*, fonte: str, operacao: str, chamada: Callable[[], T]) -> T:
    """Mede uma chamada de integração sem registrar URL, parâmetros ou corpo.

    Funciona tanto dentro da API como nos pipelines executados por script. O
    retorno é preservado integralmente; a função só emite telemetria mínima.
    """
    inicio = perf_counter()
    status_code: int | None = None
    try:
        resposta = chamada()
        status = getattr(resposta, "status_code", None)
        status_code = status if isinstance(status, int) else None
        return resposta
    except Exception as erro:
        logger.warning(
            json.dumps(
                {
                    "event": "external_request",
                    "source": fonte,
                    "operation": operacao,
                    "outcome": "error",
                    "error_type": type(erro).__name__,
                    "duration_ms": round((perf_counter() - inicio) * 1000, 2),
                },
                ensure_ascii=False,
            )
        )
        raise
    finally:
        if status_code is not None:
            logger.info(
                json.dumps(
                    {
                        "event": "external_request",
                        "source": fonte,
                        "operation": operacao,
                        "outcome": "success",
                        "status_code": status_code,
                        "duration_ms": round((perf_counter() - inicio) * 1000, 2),
                    },
                    ensure_ascii=False,
                )
            )


async def registrar_requisicao(request: Request, call_next):
    """Emite um único evento JSON por requisição, sem querystring ou corpo."""
    trace_id = _trace_id_aceitavel(request.headers.get("X-Trace-Id"))
    request.state.trace_id = trace_id
    inicio = perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Trace-Id"] = trace_id
        return response
    finally:
        logger.info(
            json.dumps(
                {
                    "event": "http_request",
                    "trace_id": trace_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": status_code,
                    "duration_ms": round((perf_counter() - inicio) * 1000, 2),
                },
                ensure_ascii=False,
            )
        )
