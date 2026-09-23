"""Adiciona Citômetro de Fluxo ao catálogo de marcadores.

Revision ID: a6b2c4d8e913
Revises: f4c7e1d9a820
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a6b2c4d8e913"
down_revision: str | None = "f4c7e1d9a820"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO equipamento_catalogo (codigo, nome, prioritario) "
            "VALUES ('citometro_fluxo', 'Citômetro de Fluxo', false) "
            "ON CONFLICT (codigo) DO NOTHING"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM equipamento_catalogo WHERE codigo = 'citometro_fluxo'"))
