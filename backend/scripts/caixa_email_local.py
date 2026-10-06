"""Caixa HTTP local em memória: não envia e-mail nem registra tokens em log."""

import os
from collections import deque
from secrets import compare_digest
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field


class Mensagem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to: str = Field(pattern=r"^[^\s@]+@example\.com$", max_length=254)
    subject: str = Field(min_length=1, max_length=200)
    fromName: str = Field(min_length=1, max_length=200)
    html: str = Field(min_length=1, max_length=100_000)


class RecebimentoRead(BaseModel):
    status: Literal["capturado-localmente"] = "capturado-localmente"


class CaixaRead(BaseModel):
    mensagens: list[Mensagem] = Field(max_length=200)


def criar_app(segredo: str | None = None) -> FastAPI:
    chave = segredo or os.environ.get("MAIL_API_SECRET", "")
    if len(chave) < 32:
        raise ValueError("Chave privada da caixa local ausente.")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    mensagens: deque[Mensagem] = deque(maxlen=200)

    def autenticar(x_api_key: Annotated[str | None, Header()] = None) -> None:
        if not x_api_key or not compare_digest(x_api_key.encode(), chave.encode()):
            raise HTTPException(status_code=401, detail="Acesso inválido.")

    @app.middleware("http")
    async def proteger_resposta(request: Request, call_next):
        if request.method == "POST":
            tamanho = request.headers.get("content-length", "")
            if not tamanho.isdigit() or int(tamanho) > 128_000:
                return JSONResponse({"detail": "Mensagem excede limite local."}, status_code=413)
        resposta = await call_next(request)
        resposta.headers["Cache-Control"] = "no-store"
        resposta.headers["X-Content-Type-Options"] = "nosniff"
        resposta.headers["X-Frame-Options"] = "DENY"
        return resposta

    @app.post("/enviar", dependencies=[Depends(autenticar)], response_model=RecebimentoRead)
    def receber(mensagem: Mensagem) -> RecebimentoRead:
        mensagens.append(mensagem)
        return RecebimentoRead()

    @app.get("/mensagens", dependencies=[Depends(autenticar)], response_model=CaixaRead)
    def listar() -> CaixaRead:
        return CaixaRead(mensagens=list(mensagens))

    return app
