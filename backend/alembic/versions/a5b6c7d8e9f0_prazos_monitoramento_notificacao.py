"""Avisos de prazo (ação e inauguração prevista) e chave de deduplicação da notificação.

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-10-23 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, Sequence[str], None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'prazo_acao'")
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'prazo_inauguracao'")
    op.add_column("notificacao", sa.Column("chave_dedup", sa.String(), nullable=True))
    op.create_index(
        "uq_notificacao_chave_dedup",
        "notificacao",
        ["chave_dedup"],
        unique=True,
        postgresql_where=sa.text("chave_dedup IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_notificacao_chave_dedup", table_name="notificacao")
    op.drop_column("notificacao", "chave_dedup")
    # Valores de enum não se removem com segurança no PostgreSQL; downgrade neutro para eles.
