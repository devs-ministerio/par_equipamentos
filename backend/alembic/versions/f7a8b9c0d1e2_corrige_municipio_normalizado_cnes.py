"""Corrige a coluna de chave municipal declarada no modelo CNES.

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cnes_estabelecimento", sa.Column("municipio_normalizado", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("cnes_estabelecimento", "municipio_normalizado")
