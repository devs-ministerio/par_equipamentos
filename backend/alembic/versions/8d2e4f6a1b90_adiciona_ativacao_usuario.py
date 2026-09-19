"""Adiciona ativação de usuário por convite de e-mail.

Revision ID: 8d2e4f6a1b90
Revises: 7c1f2e9a4b60
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "8d2e4f6a1b90"
down_revision: str | None = "7c1f2e9a4b60"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user", sa.Column("activation_token_hash", sa.String(), nullable=True))
    op.add_column("user", sa.Column("activation_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user", sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_user_activation_token_hash", "user", ["activation_token_hash"])


def downgrade() -> None:
    op.drop_constraint("uq_user_activation_token_hash", "user", type_="unique")
    op.drop_column("user", "activated_at")
    op.drop_column("user", "activation_expires_at")
    op.drop_column("user", "activation_token_hash")
