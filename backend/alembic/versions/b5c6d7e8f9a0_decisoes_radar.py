"""Triagem humana append-only no Radar; não promove convênios.

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
"""

import sqlalchemy as sa
from alembic import op

revision = "b5c6d7e8f9a0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_legado_captura_candidato", "candidato_legado_captura", ["id", "candidato_id"])
    op.create_table(
        "candidato_legado_decisao",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "candidato_id",
            sa.BigInteger(),
            sa.ForeignKey("candidato_legado.id", ondelete="RESTRICT", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column("captura_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "usuario_id",
            sa.BigInteger(),
            sa.ForeignKey("user.id", ondelete="RESTRICT", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column("chave", sa.Uuid(), nullable=False),
        sa.Column("situacao_anterior", sa.String(), nullable=False),
        sa.Column("situacao", sa.String(), nullable=False),
        sa.Column("justificativa", sa.String(1000), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["captura_id", "candidato_id"],
            ["candidato_legado_captura.id", "candidato_legado_captura.candidato_id"],
            name="fk_legado_decisao_captura_candidato",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.UniqueConstraint("candidato_id", "chave", name="uq_candidato_legado_decisao_chave"),
        sa.CheckConstraint("situacao_anterior IN ('novo','em_analise')", name="ck_legado_decisao_anterior"),
        sa.CheckConstraint("situacao IN ('em_analise','rejeitado')", name="ck_legado_decisao_situacao"),
        sa.CheckConstraint(
            "(situacao = 'em_analise' AND situacao_anterior = 'novo') OR situacao = 'rejeitado'",
            name="ck_legado_decisao_transicao",
        ),
        sa.CheckConstraint("length(btrim(justificativa)) BETWEEN 3 AND 1000", name="ck_legado_decisao_justificativa"),
    )
    for nome, colunas in (
        ("idx_legado_decisao_candidato_id", ["candidato_id", "id"]),
        ("idx_legado_decisao_captura", ["captura_id"]),
        ("idx_legado_decisao_usuario", ["usuario_id"]),
    ):
        op.create_index(nome, "candidato_legado_decisao", colunas)
    # A auditoria não pode ser alterada por UPDATE/DELETE, nem mesmo fora do Service.
    op.execute("""
        CREATE FUNCTION proteger_decisao_legado() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Decisão do Radar é imutável' USING ERRCODE = '23514';
        END $$;
        CREATE TRIGGER trg_decisao_legado_imutavel
            BEFORE UPDATE OR DELETE ON candidato_legado_decisao
            FOR EACH ROW EXECUTE FUNCTION proteger_decisao_legado();
    """)


def downgrade() -> None:
    # Reversão somente desta tabela; histórico deve ser exportado antes de rollback com dados.
    op.drop_table("candidato_legado_decisao")
    op.execute("DROP FUNCTION proteger_decisao_legado()")
    op.drop_constraint("uq_legado_captura_candidato", "candidato_legado_captura", type_="unique")
