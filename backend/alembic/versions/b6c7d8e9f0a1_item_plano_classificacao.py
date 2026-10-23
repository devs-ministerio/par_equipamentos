"""Classificação do item do plano: tipo de lançamento, situação, rendimento ligado ao principal e valor.

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-10-23 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, Sequence[str], None] = "a5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "item_plano", sa.Column("tipo_lancamento", sa.String(), nullable=False, server_default="aquisicao")
    )
    op.add_column(
        "item_plano", sa.Column("situacao_classificacao", sa.String(), nullable=False, server_default="aplicada")
    )
    op.add_column("item_plano", sa.Column("motivo_classificacao", sa.Text(), nullable=True))
    op.add_column("item_plano", sa.Column("valor_total", sa.Numeric(16, 2), nullable=True))
    op.add_column(
        "item_plano",
        sa.Column(
            "item_principal_id",
            sa.BigInteger(),
            sa.ForeignKey("item_plano.id", ondelete="RESTRICT", onupdate="RESTRICT"),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_item_plano_tipo_lancamento",
        "item_plano",
        "tipo_lancamento IN ('aquisicao','rendimento_aplicacao','acessorio_insumo','multiplo','nao_equipamento')",
    )
    op.create_check_constraint(
        "ck_item_plano_situacao_classificacao",
        "item_plano",
        "situacao_classificacao IN ('aplicada','pendente')",
    )
    op.create_index("idx_item_plano_principal", "item_plano", ["item_principal_id"])
    op.create_index(
        "idx_item_plano_pendente",
        "item_plano",
        ["id"],
        postgresql_where=sa.text("situacao_classificacao = 'pendente'"),
    )


def downgrade() -> None:
    op.drop_index("idx_item_plano_pendente", table_name="item_plano")
    op.drop_index("idx_item_plano_principal", table_name="item_plano")
    op.drop_constraint("ck_item_plano_situacao_classificacao", "item_plano", type_="check")
    op.drop_constraint("ck_item_plano_tipo_lancamento", "item_plano", type_="check")
    op.drop_column("item_plano", "item_principal_id")
    op.drop_column("item_plano", "valor_total")
    op.drop_column("item_plano", "motivo_classificacao")
    op.drop_column("item_plano", "situacao_classificacao")
    op.drop_column("item_plano", "tipo_lancamento")
