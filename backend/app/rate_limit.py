"""Rate limiting -- Plan Mode seguranca 2026-09-16, Bloco 2. So
`/auth/login` (P0 do diagnostico: sem limite hoje, superficie de brute
force) usa isso por enquanto; `limiter` fica num modulo proprio (nao dentro
de `app.main`) pra `app.routers.auth` poder importar sem import circular.

Limitacao aceita conscientemente: storage default do slowapi e in-memory
(por processo) -- se o backend rodar mais de uma replica no Render, o
limite nao e compartilhado entre elas (cada replica conta separado). Para o
volume atual do projeto isso e aceitavel; documentado aqui para nao virar
suposicao de protecao mais forte do que realmente existe.
"""
from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(key_func=get_remote_address, storage_uri=settings.rate_limit_storage_uri)
