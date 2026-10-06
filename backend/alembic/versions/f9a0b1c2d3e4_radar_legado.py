"""Radar legado com evidência relacional, sem alterar carteira ou monitoramento.

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
"""

import sqlalchemy as sa

from alembic import op

revision = "f9a0b1c2d3e4"
down_revision = "e8f9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "candidato_legado",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("numero", sa.String(), nullable=False),
        sa.Column("id_proposta", sa.String(), nullable=False),
        sa.Column("ultima_captura_id", sa.BigInteger()),
        sa.Column("descoberto_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("verificado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("numero", name="uq_candidato_legado_numero"),
        sa.UniqueConstraint("id_proposta", name="uq_candidato_legado_proposta"),
        sa.CheckConstraint("numero ~ '^[0-9]+$' AND id_proposta ~ '^[0-9]+$'", name="ck_candidato_legado_identidade"),
    )
    op.create_table(
        "candidato_legado_captura",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "candidato_id",
            sa.BigInteger(),
            sa.ForeignKey("candidato_legado.id", ondelete="CASCADE", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column("confirmacao_portal", sa.String(), nullable=False),
        sa.Column("data_publicacao", sa.Date()),
        sa.Column("origem", sa.String(), nullable=False),
        sa.Column("referencia_snapshot", sa.String(64), nullable=False),
        sa.Column("hash_conteudo", sa.String(64), nullable=False),
        sa.Column("capturado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "confirmacao_portal IN ('nao_consultado','nao_encontrado','sem_publicacao','confirmado')",
            name="ck_candidato_legado_captura_confirmacao",
        ),
        sa.CheckConstraint(
            "(confirmacao_portal = 'confirmado') = (data_publicacao IS NOT NULL)",
            name="ck_candidato_legado_captura_publicacao",
        ),
        sa.CheckConstraint("origem IN ('snapshot_local','siconv_oficial')", name="ck_candidato_legado_captura_origem"),
        sa.CheckConstraint(
            "hash_conteudo ~ '^[a-f0-9]{64}$' AND referencia_snapshot ~ '^[a-f0-9]{64}$'",
            name="ck_candidato_legado_captura_hash",
        ),
    )
    op.create_foreign_key(
        "fk_candidato_legado_ultima_captura",
        "candidato_legado",
        "candidato_legado_captura",
        ["ultima_captura_id"],
        ["id"],
        ondelete="SET NULL",
        onupdate="RESTRICT",
    )
    op.create_table(
        "candidato_legado_evidencia",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "captura_id",
            sa.BigInteger(),
            sa.ForeignKey("candidato_legado_captura.id", ondelete="CASCADE", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "equipamento_catalogo_id",
            sa.BigInteger(),
            sa.ForeignKey("equipamento_catalogo.id", ondelete="RESTRICT", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column("id_item", sa.String(), nullable=False),
        sa.Column("descricao", sa.String(), nullable=False),
        sa.Column("relacao", sa.String(), nullable=False),
        sa.UniqueConstraint(
            "captura_id", "id_item", "equipamento_catalogo_id", name="uq_candidato_legado_evidencia_item"
        ),
        sa.CheckConstraint(
            "relacao IN ('aquisicao','modernizacao','existente','mencao')", name="ck_candidato_legado_evidencia_relacao"
        ),
    )
    op.create_index("idx_candidato_legado_verificado", "candidato_legado", ["verificado_em", "id"])
    op.create_index("idx_candidato_legado_captura", "candidato_legado", ["ultima_captura_id"])
    op.create_index(
        "idx_candidato_legado_captura_candidato", "candidato_legado_captura", ["candidato_id", "capturado_em"]
    )
    op.create_index(
        "idx_candidato_legado_evidencia_catalogo", "candidato_legado_evidencia", ["equipamento_catalogo_id"]
    )


def downgrade() -> None:
    # Apenas candidatos/histórico do Radar; nunca carteira, usuários ou marcos.
    op.drop_constraint("fk_candidato_legado_ultima_captura", "candidato_legado", type_="foreignkey")
    op.drop_table("candidato_legado_evidencia")
    op.drop_table("candidato_legado_captura")
    op.drop_table("candidato_legado")
