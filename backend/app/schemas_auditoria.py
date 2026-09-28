"""Contratos de leitura da trilha de auditoria (GET /auditoria) -- módulo
próprio, mesmo padrão de `schemas_monitoramento.py`/`schemas_equipamentos.py`,
pra não inchar `schemas.py` (Módulo de Auditoria, 2026-09-28)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditoriaItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    usuario_id: int | None
    usuario_nome: str | None
    usuario_email: str | None
    entity_name: str
    entity_id: int | None
    action: str
    details: dict | None


class AuditoriaPaginaRead(BaseModel):
    itens: list[AuditoriaItemRead]
    total: int
