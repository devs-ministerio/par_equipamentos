"""Ponto de entrada da API do SIGEO."""
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import CSRF_COOKIE_NAME, CSRF_HEADER_NAME
from app.config import settings
from app.db.base import get_db
from app.errors import register_exception_handlers
from app.observability import registrar_requisicao
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
    usuarios,
)

app = FastAPI(title="SIGEO — Sistema de Gestão de Equipamentos em Oncologia")
register_exception_handlers(app)

# Rate limiting (Plan Mode seguranca 2026-09-16, Bloco 2) -- so /auth/login
# e /auth/refresh usam `@limiter.limit(...)` hoje (ver app/routers/auth.py).
app.state.limiter = limiter


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    return await registrar_requisicao(request, call_next)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    # Nunca vaza o limite/janela configurados (detalhe interno) -- resposta
    # generica, mesmo padrao do resto de app/errors.py.
    return JSONResponse(
        status_code=429,
        content={"error": "Muitas tentativas. Tente novamente em instantes.", "detail": None},
    )
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
# Gestao de usuarios (Modulo Admin) -- so role=admin acessa
# (require_admin_user, app/auth.py), diferente do gate binario
# leitor/resto do resto do app.
app.include_router(usuarios.router)

# Frontend roda em origem separada (Vite local, Vercel em producao). As
# origens autorizadas vem da variavel CORS_ORIGINS -- nunca fixo aqui, senao
# o deploy em nuvem bloqueia o proprio frontend. Metodos/headers explicitos
# (Plan Mode seguranca 2026-09-16, Bloco 4) -- wildcard com
# allow_credentials=True e a combinacao que o diagnostico apontou como
# achado P1.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_lista,
    allow_credentials=True,
    # DELETE adicionado no Plan Mode monitoramento-evolucao 2026-09-19
    # (PATCH/DELETE de eventos/ações) -- achado ao vivo: preflight OPTIONS
    # falhava com a lista antiga (GET/POST/PATCH), sem DELETE.
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", CSRF_HEADER_NAME],
)

# Rotas isentas de CSRF -- login ainda nao tem cookie de sessao/CSRF pra
# comparar (e' o proprio ato que os emite); saude e publica e nao muta nada.
_CSRF_ROTAS_ISENTAS = {"/auth/login", "/health"}
_METODOS_MUTAVEIS = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    """Double-submit cookie (Bloco 1 do Plan Mode consolidacao 2026-09-17)
    -- toda rota mutavel (incluindo `/auth/refresh`/`/auth/logout`, POSTs
    sem corpo que antes nao tinham nenhuma defesa) exige que o header
    `X-CSRF-Token` bata com o cookie `sigeo_csrf` (nao HttpOnly, legivel
    por JS). Aplicado como middleware global -- nao como dependency por
    rota -- justamente pra nao depender de lembrar de anotar cada router
    novo (`monitoramento.py`/`propostas_candidatas.py`/`notificacoes.py`
    ja tem 7 rotas mutaveis hoje, espalhadas por 3 arquivos)."""
    if request.method in _METODOS_MUTAVEIS and request.url.path not in _CSRF_ROTAS_ISENTAS:
        cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
        header_token = request.headers.get(CSRF_HEADER_NAME)
        if not cookie_token or not header_token or cookie_token != header_token:
            return JSONResponse(
                status_code=403,
                content={"error": "Token CSRF ausente ou invalido.", "detail": None},
            )
    return await call_next(request)


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
    # A API só entrega dados autenticados ou operacionais; não permitir que
    # browser/proxy compartilhe respostas em cache entre sessões.
    if request.url.path != "/health":
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """Prova de vida real -- confirma que a API consegue falar com o banco,
    nao so que o processo subiu."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
