"""Registro central de troca de decisao de config (RN de governanca) --
espelha app/audit.py::log_action: uma funcao so, pra "trocar a decisao da
chave X" nunca virar duas escritas soltas (fechar a vigente + abrir a
nova) que algum chamador possa fazer fora de ordem ou esquecer uma
metade.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ConfigDecision, ConfigDecisionKey


def registrar_decisao(
    db: Session,
    *,
    key: ConfigDecisionKey,
    value: str,
    confirmed: bool,
    confirmed_by: int | None,
) -> ConfigDecision:
    """Fecha a linha vigente da chave (se existir) e insere a nova como
    vigente -- nunca faz UPDATE de `value` numa linha existente (ver
    docstring de ConfigDecision). Nao commita sozinho -- fica na mesma
    transacao de quem chamou, mesma convencao de log_action."""
    agora = datetime.now(timezone.utc)

    vigente = db.execute(
        select(ConfigDecision).where(ConfigDecision.key == key, ConfigDecision.valid_to.is_(None))
    ).scalar_one_or_none()
    if vigente is not None:
        vigente.valid_to = agora

    nova = ConfigDecision(
        key=key,
        value=value,
        confirmed=confirmed,
        confirmed_by=confirmed_by,
        confirmed_at=agora if confirmed else None,
        valid_from=agora,
    )
    db.add(nova)
    db.flush()  # mesmo motivo do flush em run_pipeline_tomografo.py -- garante
    # que o fechamento da linha antiga (UPDATE) e a nova linha (INSERT) ja
    # estao visiveis pra qualquer leitura subsequente na mesma transacao,
    # antes do commit do chamador.
    return nova


def decisao_vigente(db: Session, key: ConfigDecisionKey) -> ConfigDecision | None:
    return db.execute(
        select(ConfigDecision).where(ConfigDecision.key == key, ConfigDecision.valid_to.is_(None))
    ).scalar_one_or_none()
