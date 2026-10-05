"""adiciona timeout de inatividade/absoluto ao refresh_token

Revision ID: a3f1c9e7b204
Revises: f7a8b9c0d1e2
Create Date: 2026-10-05
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a3f1c9e7b204"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `server_default=now()` backfila sessao existente com o instante da
    # migration -- nao desloga ninguem de imediato, so faz o timer de
    # idle/absoluto comecar a contar a partir de agora pra quem ja estava
    # logado (ver CLAUDE.md "Expiracao por inatividade").
    op.add_column(
        "refresh_token",
        sa.Column("last_used_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column(
        "refresh_token",
        sa.Column("session_started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("refresh_token", "session_started_at")
    op.drop_column("refresh_token", "last_used_at")
