"""cancelamento_unidade_planejada

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-11-18 21:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b2c3d4e5f6a8"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cancelamento_unidade_planejada",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("item_id", sa.BigInteger(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("autor_id", sa.BigInteger(), nullable=True),
        sa.Column("deletado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletado_por_id", sa.BigInteger(), nullable=True),
        sa.Column("motivo_exclusao", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("length(btrim(motivo)) > 0", name="ck_cancelamento_unidade_motivo"),
        sa.ForeignKeyConstraint(["autor_id"], ["user.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["deletado_por_id"], ["user.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["item_id"], ["item_plano.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_cancelamento_unidade_item", "cancelamento_unidade_planejada", ["item_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_cancelamento_unidade_item", table_name="cancelamento_unidade_planejada")
    op.drop_table("cancelamento_unidade_planejada")
