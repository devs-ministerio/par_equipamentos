"""Utilitários compartilhados dos casos de uso de monitoramento."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import (
    Notificacao,
    NotificacaoTipo,
)
from app.repositories import monitoramento as monitoramento_repo

# Mesmo dicionário fechado do CHECK constraint em models.py -- validado
# aqui também pra devolver 422 limpo em vez do IntegrityError cru do
# Postgres (Plan Mode monitoramento-evolucao 2026-09-19).
_TIPOLOGIAS_VALIDAS = {"A", "CV", "C", "EO", "C.B", "NA"}
_MODALIDADES_ONCO_VALIDAS = {"Apoio", "Diagnóstico", "Rastreamento", "Tratamento", "Múltiplas"}


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _notificar_edicao_manual(db: Session, *, instrumento_id: int, titulo: str, corpo: str) -> None:
    """Notificação de edição manual do monitoramento interno -- mesmo `tipo`
    já usado por `atualizar_cadastro_instrumento` (frontend já rotula
    `edicao_manual` como "Edição manual"), agora também disparada por
    evento/ação de instrumento (achado 2026-09-25: só o cadastro notificava,
    criar/editar/excluir `EventoMarco`/`AcaoMonitoramento` só gravava
    AuditLog, sem notificar titular/suplente/gestor/admin)."""
    monitoramento_repo.adicionar_notificacao(
        db,
        Notificacao(
            tipo=NotificacaoTipo.edicao_manual,
            titulo=titulo,
            corpo=corpo,
            entidade_id=instrumento_id,
        ),
    )


def _compor_observacao(autor_nome: str, observacao: str | None) -> str:
    """Autoria autenticada fica visivel junto do texto para leitura rapida."""
    prefixo = f"[{autor_nome}]"
    return f"{prefixo} {observacao}" if observacao else prefixo
