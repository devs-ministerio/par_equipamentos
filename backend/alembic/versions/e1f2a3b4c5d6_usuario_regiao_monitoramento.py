"""usuario_regiao_monitoramento

UFs que cada técnico acompanha, para o painel individual do monitoramento interno.

Revision ID: e1f2a3b4c5d6
Revises: d9e0f1a2b3c4
Create Date: 2026-11-23 17:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "usuario_regiao_monitoramento",
        sa.Column("usuario_id", sa.BigInteger(), nullable=False),
        sa.Column("uf", sa.String(length=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["usuario_id"], ["user.id"], onupdate="RESTRICT", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("usuario_id", "uf"),
    )


def downgrade() -> None:
    op.drop_table("usuario_regiao_monitoramento")
