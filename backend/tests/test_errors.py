"""Testa app/domain_errors.py + o tradutor central em app/errors.py --
cada subclasse de DomainError precisa cair no mesmo status/formato de
corpo que HTTPException produzia antes da migração (Plan Mode backend
2026-09-17, Bloco A)."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.domain_errors import AuthorizationError, ConflictError, DomainError, NotFoundError, ValidationError
from app.errors import register_exception_handlers


def _app_de_teste() -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/not-found")
    def _not_found():
        raise NotFoundError("Recurso não encontrado.")

    @app.get("/conflict")
    def _conflict():
        raise ConflictError("Estado em conflito.")

    @app.get("/validation")
    def _validation():
        raise ValidationError("Dado inválido.")

    @app.get("/authorization")
    def _authorization():
        raise AuthorizationError("Sem permissão.")

    return TestClient(app, raise_server_exceptions=False)


def test_not_found_error_vira_404():
    resposta = _app_de_teste().get("/not-found")
    assert resposta.status_code == 404
    assert resposta.json() == {"error": "Recurso não encontrado.", "detail": None}


def test_conflict_error_vira_409():
    resposta = _app_de_teste().get("/conflict")
    assert resposta.status_code == 409
    assert resposta.json() == {"error": "Estado em conflito.", "detail": None}


def test_validation_error_vira_422():
    resposta = _app_de_teste().get("/validation")
    assert resposta.status_code == 422
    assert resposta.json() == {"error": "Dado inválido.", "detail": None}


def test_authorization_error_vira_403():
    resposta = _app_de_teste().get("/authorization")
    assert resposta.status_code == 403
    assert resposta.json() == {"error": "Sem permissão.", "detail": None}


def test_domain_error_base_status_400():
    class ErroGenerico(DomainError):
        pass

    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/generico")
    def _generico():
        raise ErroGenerico("Erro genérico de domínio.")

    resposta = TestClient(app, raise_server_exceptions=False).get("/generico")
    assert resposta.status_code == 400
    assert resposta.json() == {"error": "Erro genérico de domínio.", "detail": None}
