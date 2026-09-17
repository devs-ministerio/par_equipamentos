"""Hierarquia de erro de domínio -- Services levantam essas exceções em vez
de `fastapi.HTTPException` direto (achado P1.3 do diagnóstico backend
2026-09-16: Service importando FastAPI acopla regra de negócio à camada
web). Tradução pra HTTP acontece num único lugar, `app/errors.py`
(`register_exception_handlers`). Módulo separado de `app/errors.py` de
propósito -- deixa explícito, por import, quando um Service depende de
FastAPI (não deveria) vs. só de `app.domain_errors` (esperado).
"""
from __future__ import annotations


class DomainError(Exception):
    """Base -- nunca levantada diretamente, só as subclasses abaixo."""

    status_code: int = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    status_code = 409


class ValidationError(DomainError):
    status_code = 422


class AuthorizationError(DomainError):
    status_code = 403
