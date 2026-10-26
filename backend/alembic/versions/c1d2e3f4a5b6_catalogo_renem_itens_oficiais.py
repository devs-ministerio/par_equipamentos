"""Catálogo oficial por código: RENEM, códigos legados e famílias com controle por unidade.

Revision ID: c1d2e3f4a5b6
Revises: b7f35c806e4a

Só aditiva: duas colunas novas em `equipamento_catalogo` e duas tabelas novas. Nenhuma
linha existente é alterada; a carga dos dados é feita por
`scripts/atualizar_catalogo_equipamentos.py`.
"""

import sqlalchemy as sa

from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "b7f35c806e4a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "equipamento_catalogo",
        sa.Column("controle_por_unidade", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("equipamento_catalogo", sa.Column("nome_oficial", sa.String(), nullable=True))
    op.create_table(
        "renem_item",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("codigo_item", sa.String(length=6), nullable=False),
        sa.Column("nome", sa.String(), nullable=False),
        sa.Column("definicao", sa.Text(), nullable=True),
        sa.Column("classificacao", sa.String(), nullable=True),
        sa.Column("valor_sugerido", sa.Numeric(16, 4), nullable=True),
        sa.Column("item_dolarizado", sa.Boolean(), nullable=True),
        sa.Column("versao_lista", sa.String(), nullable=False),
        sa.Column("catalogo_id", sa.BigInteger(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("codigo_item ~ '^[0-9]{6}$'", name="ck_renem_item_codigo"),
        sa.ForeignKeyConstraint(["catalogo_id"], ["equipamento_catalogo.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo_item", "versao_lista", name="uq_renem_item_codigo_versao"),
    )
    op.create_index("idx_renem_item_catalogo", "renem_item", ["catalogo_id"])
    op.create_table(
        "codigo_item_legado",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("codigo_item", sa.String(length=6), nullable=False),
        sa.Column("nome", sa.String(), nullable=False),
        sa.Column("catalogo_id", sa.BigInteger(), nullable=False),
        sa.Column("origem", sa.String(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("codigo_item ~ '^[0-9]{6}$'", name="ck_codigo_item_legado_codigo"),
        sa.CheckConstraint("origem IN ('dados', 'usuario')", name="ck_codigo_item_legado_origem"),
        sa.ForeignKeyConstraint(["catalogo_id"], ["equipamento_catalogo.id"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo_item", name="uq_codigo_item_legado_codigo"),
    )
    op.create_index("idx_codigo_item_legado_catalogo", "codigo_item_legado", ["catalogo_id"])


def downgrade() -> None:
    op.drop_index("idx_codigo_item_legado_catalogo", table_name="codigo_item_legado")
    op.drop_table("codigo_item_legado")
    op.drop_index("idx_renem_item_catalogo", table_name="renem_item")
    op.drop_table("renem_item")
    op.drop_column("equipamento_catalogo", "nome_oficial")
    op.drop_column("equipamento_catalogo", "controle_por_unidade")
