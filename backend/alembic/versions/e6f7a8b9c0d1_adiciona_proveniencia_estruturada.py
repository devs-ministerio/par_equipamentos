"""Catálogo de fonte de dado em expand-contract.

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fonte_dado",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("codigo", sa.String(), nullable=False),
        sa.Column("nome", sa.String(), nullable=False),
        sa.Column("tipo", sa.String(), nullable=False),
        sa.Column("url_referencia", sa.String(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("codigo", name="uq_fonte_dado_codigo"),
    )
    for tabela in ("convenio", "instrumento_equipamento", "pagamento_obra_persus"):
        op.add_column(tabela, sa.Column("fonte_dado_id", sa.BigInteger(), nullable=True))
        op.create_foreign_key(f"fk_{tabela}_fonte_dado", tabela, "fonte_dado", ["fonte_dado_id"], ["id"], ondelete="SET NULL", onupdate="RESTRICT")
        op.create_index(f"idx_{tabela}_fonte_dado", tabela, ["fonte_dado_id"])


def downgrade() -> None:
    for tabela in ("pagamento_obra_persus", "instrumento_equipamento", "convenio"):
        op.drop_index(f"idx_{tabela}_fonte_dado", table_name=tabela)
        op.drop_constraint(f"fk_{tabela}_fonte_dado", tabela, type_="foreignkey")
        op.drop_column(tabela, "fonte_dado_id")
    op.drop_table("fonte_dado")
