"""conclusao_instrumento

Revision ID: e5f6a7b8c9d1
Revises: d4e5f6a7b8c0
Create Date: 2026-11-19 09:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e5f6a7b8c9d1"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conclusao_instrumento",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("instrumento_id", sa.BigInteger(), nullable=False),
        sa.Column("resultado", sa.String(), nullable=False),
        sa.Column("data_conclusao", sa.Date(), nullable=False),
        sa.Column("justificativa", sa.Text(), nullable=True),
        sa.Column("data_inauguracao", sa.Date(), nullable=True),
        sa.Column("autor_id", sa.BigInteger(), nullable=True),
        sa.Column("deletado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletado_por_id", sa.BigInteger(), nullable=True),
        sa.Column("motivo_exclusao", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("resultado IN ('integral', 'parcial', 'sem_entregas')", name="ck_conclusao_instrumento_resultado"),
        sa.CheckConstraint(
            "resultado = 'integral' OR length(btrim(coalesce(justificativa, ''))) > 0",
            name="ck_conclusao_instrumento_justificativa",
        ),
        sa.ForeignKeyConstraint(["instrumento_id"], ["instrumento_equipamento.id"], onupdate="RESTRICT", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["autor_id"], ["user.id"], onupdate="RESTRICT", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["deletado_por_id"], ["user.id"], onupdate="RESTRICT", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_conclusao_instrumento_ativa",
        "conclusao_instrumento",
        ["instrumento_id"],
        unique=True,
        postgresql_where=sa.text("deletado_em IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_conclusao_instrumento_ativa", table_name="conclusao_instrumento")
    op.drop_table("conclusao_instrumento")
