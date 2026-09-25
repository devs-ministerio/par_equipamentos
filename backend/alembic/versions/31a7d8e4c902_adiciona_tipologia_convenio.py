"""Preserva tipologia PERSUS como atributo próprio."""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision = "31a7d8e4c902"
down_revision = "26becbd31f95"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("convenio", sa.Column("tipologia", sa.String(length=3), nullable=True))


def downgrade() -> None:
    op.drop_column("convenio", "tipologia")
