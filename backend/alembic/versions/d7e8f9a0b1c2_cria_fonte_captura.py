"""cria fonte_captura e tipo de notificação fonte_indisponivel

Revision ID: d7e8f9a0b1c2
Revises: c6e7f8091a2b
Create Date: 2026-10-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "c6e7f8091a2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'fonte_indisponivel'")
    op.create_table(
        "fonte_captura",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("fonte", sa.String(), nullable=False),
        sa.Column("iniciado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finalizado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("itens_verificados", sa.Integer(), server_default="0", nullable=False),
        sa.Column("itens_alterados", sa.Integer(), server_default="0", nullable=False),
        sa.Column("avisos_criados", sa.Integer(), server_default="0", nullable=False),
        sa.Column("erro", sa.String()),
        sa.Column("detalhes", postgresql.JSONB(astext_type=sa.Text())),
        sa.CheckConstraint("status IN ('ok', 'parcial', 'erro')", name="ck_fonte_captura_status"),
    )
    op.create_index("idx_fonte_captura_fonte_iniciado", "fonte_captura", ["fonte", "iniciado_em"])


def downgrade() -> None:
    op.drop_index("idx_fonte_captura_fonte_iniciado", table_name="fonte_captura")
    op.drop_table("fonte_captura")
