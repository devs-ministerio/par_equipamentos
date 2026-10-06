"""Arquivamento por destinatário, sem excluir o histórico da equipe.

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
"""

import sqlalchemy as sa

from alembic import op

revision = "e8f9a0b1c2d3"
down_revision = "d7e8f9a0b1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notificacao_destinatario", sa.Column("arquivada", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.create_index(
        "idx_notificacao_destinatario_usuario_arquivo",
        "notificacao_destinatario",
        ["usuario_id", "arquivada", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_notificacao_destinatario_usuario_arquivo", table_name="notificacao_destinatario")
    op.drop_column("notificacao_destinatario", "arquivada")
