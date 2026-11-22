"""repasse_instrumento

Revision ID: a1b2c3d4e5f7
Revises: e9f0a1b2c3d4
Create Date: 2026-11-18 20:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, Sequence[str], None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "repasse_instrumento",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("instrumento_id", sa.BigInteger(), nullable=False),
        sa.Column("tipo", sa.String(), nullable=False),
        sa.Column("origem", sa.String(), nullable=False),
        sa.Column("justificativa", sa.Text(), nullable=True),
        sa.Column("autor_id", sa.BigInteger(), nullable=True),
        sa.Column("substituido_por_id", sa.BigInteger(), nullable=True),
        sa.Column("deletado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletado_por_id", sa.BigInteger(), nullable=True),
        sa.Column("motivo_exclusao", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("tipo IN ('integral','parcial')", name="ck_repasse_instrumento_tipo"),
        sa.CheckConstraint("origem IN ('fonte','manual')", name="ck_repasse_instrumento_origem"),
        sa.CheckConstraint("origem <> 'manual' OR autor_id IS NOT NULL", name="ck_repasse_instrumento_manual_autor"),
        sa.ForeignKeyConstraint(["autor_id"], ["user.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["deletado_por_id"], ["user.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["instrumento_id"], ["instrumento_equipamento.id"], onupdate="RESTRICT", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["substituido_por_id"], ["repasse_instrumento.id"], onupdate="RESTRICT", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_repasse_instrumento_instrumento", "repasse_instrumento", ["instrumento_id"], unique=False)
    op.create_index(
        "uq_repasse_instrumento_fonte_ativo",
        "repasse_instrumento",
        ["instrumento_id"],
        unique=True,
        postgresql_where=sa.text("origem = 'fonte' AND deletado_em IS NULL AND substituido_por_id IS NULL"),
    )
    op.create_index(
        "uq_repasse_instrumento_manual_ativo",
        "repasse_instrumento",
        ["instrumento_id"],
        unique=True,
        postgresql_where=sa.text("origem = 'manual' AND deletado_em IS NULL AND substituido_por_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_repasse_instrumento_manual_ativo", table_name="repasse_instrumento")
    op.drop_index("uq_repasse_instrumento_fonte_ativo", table_name="repasse_instrumento")
    op.drop_index("idx_repasse_instrumento_instrumento", table_name="repasse_instrumento")
    op.drop_table("repasse_instrumento")
