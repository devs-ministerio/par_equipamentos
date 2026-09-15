"""Ponto de entrada da API do SIGEO."""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.errors import register_exception_handlers
from app.routers import (
    auth,
    equipment_offer,
    macro_coverage,
    monitoramento,
    municipality_coverage,
    notificacoes,
    propostas_candidatas,
)

app = FastAPI(title="SIGEO — Sistema de Gestão de Equipamentos em Oncologia")
register_exception_handlers(app)
app.include_router(auth.router)
app.include_router(macro_coverage.router)
app.include_router(municipality_coverage.router)
app.include_router(equipment_offer.router)
# Monitoramento de equipamento pos-repasse -- esforco separado da analise de
# merito (decisao 2026-09-03), ver app/routers/monitoramento.py.
app.include_router(monitoramento.router)
# Radar de Convenios -- notificacao de proposta candidata/atualizacao de
# API/edicao manual, ver docs/arquitetura/fluxo_requisicao.md.
app.include_router(notificacoes.router)
app.include_router(propostas_candidatas.router)

# Frontend roda em origem separada (Vite local, Vercel em producao). As
# origens autorizadas vem da variavel CORS_ORIGINS -- nunca fixo aqui, senao
# o deploy em nuvem bloqueia o proprio frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_lista,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """Prova de vida real -- confirma que a API consegue falar com o banco,
    nao so que o processo subiu."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
