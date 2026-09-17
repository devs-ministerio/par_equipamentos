"""Tratamento de erro padronizado -- toda resposta de erro da API sai no
mesmo formato ({"error": "...", "detail": "..."}), seja um HTTPException
lancado manualmente, um erro de validacao do Pydantic, ou algo inesperado.
Registrado em app/main.py via register_exception_handlers(app).
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.domain_errors import DomainError

# Registrando no HTTPException do Starlette (classe-mae da do FastAPI) --
# assim pega tanto o 404 interno de rota nao encontrada (que o Starlette
# levanta direto, antes do codigo da aplicacao rodar) quanto qualquer
# HTTPException levantado dentro de uma rota nossa.

logger = logging.getLogger("sieo")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def domain_error_handler(request: Request, exc: DomainError):
        # Mesmo formato de resposta que HTTPException abaixo -- erro de
        # dominio (levantado de dentro de um Service, sem depender de
        # FastAPI) e erro "de fora" convergem pro mesmo contrato HTTP.
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.message, "detail": None},
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail, "detail": None},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        # Nunca repassa `input`/`ctx` de exc.errors() -- ecoa o payload
        # bruto enviado pelo cliente (ex. senha de /auth/login mal validada)
        # de volta na resposta (Plan Mode seguranca 2026-09-16, Bloco 1).
        detalhe = [
            {"loc": erro.get("loc"), "msg": erro.get("msg"), "type": erro.get("type")}
            for erro in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"error": "Dados invalidos", "detail": detalhe},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        # Nunca vaza detalhe de erro interno pro cliente -- so loga.
        logger.exception("Erro nao tratado em %s", request.url)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "Erro interno", "detail": None},
        )
