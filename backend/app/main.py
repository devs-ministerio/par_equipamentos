"""Ponto de entrada da API do SIGEO."""
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.errors import register_exception_handlers
from app.rate_limit import limiter
from app.routers import (
    auth,
    convenios,
    equipment_offer,
    macro_coverage,
    monitoramento,
    municipality_coverage,
    notificacoes,
    propostas_candidatas,
)

app = FastAPI(title="SIGEO — Sistema de Gestão de Equipamentos em Oncologia")
register_exception_handlers(app)

# Rate limiting (Plan Mode seguranca 2026-09-16, Bloco 2) -- so /auth/login
# e /auth/refresh usam `@limiter.limit(...)` hoje (ver app/routers/auth.py).
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    # Nunca vaza o limite/janela configurados (detalhe interno) -- resposta
    # generica, mesmo padrao do resto de app/errors.py.
    return JSONResponse(status_code=429, content={"error": "Muitas tentativas. Tente novamente em instantes.", "detail": None})
app.include_router(auth.router)
app.include_router(macro_coverage.router)
app.include_router(municipality_coverage.router)
app.include_router(equipment_offer.router)
# Instrumentos firmados -- achado 2026-09-16, "parar de usar json estático,
# coloque tudo no banco", ver app/routers/convenios.py.
app.include_router(convenios.router)
# Monitoramento de equipamento pos-repasse -- esforco separado da analise de
# merito (decisao 2026-09-03), ver app/routers/monitoramento.py.
app.include_router(monitoramento.router)
# Radar de Convenios -- notificacao de proposta candidata/atualizacao de
# API/edicao manual, ver docs/arquitetura/fluxo_requisicao.md.
app.include_router(notificacoes.router)
app.include_router(propostas_candidatas.router)

# Frontend roda em origem separada (Vite local, Vercel em producao). As
# origens autorizadas vem da variavel CORS_ORIGINS -- nunca fixo aqui, senao
# o deploy em nuvem bloqueia o proprio frontend. Metodos/headers explicitos
# (Plan Mode seguranca 2026-09-16, Bloco 4) -- wildcard com
# allow_credentials=True e a combinacao que o diagnostico apontou como
# achado P1. `Authorization` continua na lista so durante a fase de
# compatibilidade dupla bearer/cookie do Bloco 2 (secao 2.8) -- remover
# quando essa fase fechar.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_lista,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Headers de hardening de navegador (Plan Mode seguranca 2026-09-16,
    Bloco 4) -- nenhum protege dado por si so, mas fecham vetores de
    clickjacking/MIME sniffing/vazamento de referrer que o diagnostico
    apontou como ausentes. CSP comeca em `Report-Only` de proposito: uma
    politica errada bloqueando algo de verdade e pior que a ausencia dela;
    so vira enforcement (`Content-Security-Policy`) depois de um periodo
    de observacao das violacoes reportadas em producao."""
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy-Report-Only"] = "default-src 'none'; frame-ancestors 'none'"
    return response


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """Prova de vida real -- confirma que a API consegue falar com o banco,
    nao so que o processo subiu."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
