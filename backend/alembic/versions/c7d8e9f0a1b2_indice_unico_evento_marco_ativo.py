"""Índice único: só 1 EventoMarco ativo por (instrumento, marco).

A regra "ativo = substituido_por_id IS NULL AND deletado_em IS NULL, só 1 por marco" (ver
docstring de EventoMarco) nunca foi garantida por constraint -- só por disciplina de código.
Auditoria de banco (2026-10-28) achou 158 pares (instrumento, marco) com mais de 1 evento ativo
simultâneo em produção, herdados de imports que nunca marcaram o evento antigo como substituído.
Consolidados por `scripts/consolidar_eventos_marco_duplicados.py` antes desta migração -- rodar
essa consolidação de novo se esta migração falhar por violação de unicidade (indica duplicado
reintroduzido entre a consolidação e a migração).

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-10-28 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, Sequence[str], None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("idx_evento_marco_ativo", table_name="evento_marco")
    op.create_index(
        "idx_evento_marco_ativo",
        "evento_marco",
        ["instrumento_id", "marco_id"],
        unique=True,
        postgresql_where=sa.text("substituido_por_id IS NULL AND deletado_em IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_evento_marco_ativo", table_name="evento_marco")
    op.create_index(
        "idx_evento_marco_ativo",
        "evento_marco",
        ["instrumento_id", "marco_id"],
        postgresql_where=sa.text("substituido_por_id IS NULL AND deletado_em IS NULL"),
    )
