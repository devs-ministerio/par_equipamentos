"""decisao_classificacao_item: decisões append-only de classificação de itens

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
"""

import sqlalchemy as sa

from alembic import op

revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "decisao_classificacao_item",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("convenio_numero", sa.String(), nullable=False),
        sa.Column("chave_item", sa.String(), nullable=False),
        sa.Column("tipo_lancamento", sa.String(), nullable=False),
        sa.Column("codigo_item", sa.String(6)),
        sa.Column("conta_unidade", sa.Boolean()),
        sa.Column("origem", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="aplicada"),
        sa.Column("observacao", sa.Text()),
        sa.Column(
            "substituida_por_id",
            sa.BigInteger(),
            sa.ForeignKey("decisao_classificacao_item.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        ),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "tipo_lancamento IN ('aquisicao','rendimento_aplicacao','acessorio_insumo','multiplo','nao_equipamento')",
            name="ck_decisao_class_item_tipo",
        ),
        sa.CheckConstraint("codigo_item IS NULL OR codigo_item ~ '^[0-9]{6}$'", name="ck_decisao_class_item_codigo"),
        sa.CheckConstraint("origem IN ('motor','revisao_equipe','tecnico')", name="ck_decisao_class_item_origem"),
        sa.CheckConstraint("status IN ('aplicada','pendente')", name="ck_decisao_class_item_status"),
    )
    op.create_index("idx_decisao_class_item_convenio", "decisao_classificacao_item", ["convenio_numero"])
    op.create_index(
        "uq_decisao_class_item_vigente",
        "decisao_classificacao_item",
        ["convenio_numero", "chave_item"],
        unique=True,
        postgresql_where=sa.text("substituida_por_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("decisao_classificacao_item")
