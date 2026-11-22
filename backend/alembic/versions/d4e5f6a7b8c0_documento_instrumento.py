"""documento_instrumento

Revision ID: d4e5f6a7b8c0
Revises: c3d4e5f6a7b9
Create Date: 2026-11-18 23:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d4e5f6a7b8c0"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "documento_instrumento",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("instrumento_id", sa.BigInteger(), nullable=False),
        sa.Column("tipo", sa.String(), nullable=False),
        sa.Column("numero", sa.String(), nullable=True),
        sa.Column("data_documento", sa.Date(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("data_validade", sa.Date(), nullable=True),
        sa.Column("observacao", sa.String(), nullable=True),
        sa.Column("autor_id", sa.BigInteger(), nullable=True),
        sa.Column("origem_evento_id", sa.BigInteger(), nullable=True),
        sa.Column("substituido_por_id", sa.BigInteger(), nullable=True),
        sa.Column("deletado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletado_por_id", sa.BigInteger(), nullable=True),
        sa.Column("motivo_exclusao", sa.String(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "tipo IN ('nota_fiscal', 'ordem_servico', 'trp', 'trd', 'cnen_scra', 'cnen_licenca')",
            name="ck_documento_instrumento_tipo",
        ),
        sa.ForeignKeyConstraint(
            ["instrumento_id"], ["instrumento_equipamento.id"], onupdate="RESTRICT", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["autor_id"], ["user.id"], onupdate="RESTRICT", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["origem_evento_id"], ["evento_marco.id"], onupdate="RESTRICT", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["substituido_por_id"], ["documento_instrumento.id"], onupdate="RESTRICT", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["deletado_por_id"], ["user.id"], onupdate="RESTRICT", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_documento_instrumento_instrumento", "documento_instrumento", ["instrumento_id", "tipo"], unique=False
    )
    op.create_index(
        "uq_documento_instrumento_origem_evento",
        "documento_instrumento",
        ["origem_evento_id"],
        unique=True,
        postgresql_where=sa.text("origem_evento_id IS NOT NULL AND deletado_em IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_documento_instrumento_origem_evento", table_name="documento_instrumento")
    op.drop_index("idx_documento_instrumento_instrumento", table_name="documento_instrumento")
    op.drop_table("documento_instrumento")
