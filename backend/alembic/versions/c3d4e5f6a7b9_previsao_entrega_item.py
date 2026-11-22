"""previsao_entrega_item e tipo de aviso prazo_previsao_entrega

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a8
Create Date: 2026-11-18 22:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b9"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'prazo_previsao_entrega'")
    op.create_table(
        "previsao_entrega_item",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("item_id", sa.BigInteger(), nullable=False),
        sa.Column("data_prevista", sa.Date(), nullable=False),
        sa.Column("autor_id", sa.BigInteger(), nullable=True),
        sa.Column("substituido_por_id", sa.BigInteger(), nullable=True),
        sa.Column("deletado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletado_por_id", sa.BigInteger(), nullable=True),
        sa.Column("motivo_exclusao", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["autor_id"], ["user.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["deletado_por_id"], ["user.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["item_id"], ["item_plano.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["substituido_por_id"], ["previsao_entrega_item.id"], onupdate="RESTRICT", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_previsao_entrega_item", "previsao_entrega_item", ["item_id"], unique=False)
    op.create_index(
        "uq_previsao_entrega_item_ativa",
        "previsao_entrega_item",
        ["item_id"],
        unique=True,
        postgresql_where=sa.text("substituido_por_id IS NULL AND deletado_em IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_previsao_entrega_item_ativa", table_name="previsao_entrega_item")
    op.drop_index("idx_previsao_entrega_item", table_name="previsao_entrega_item")
    op.drop_table("previsao_entrega_item")
    # Valores de enum não se removem com segurança no PostgreSQL; downgrade neutro para ele.
