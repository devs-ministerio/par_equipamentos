"""Expande decisão append-only com aprovação vinculada à prova e carteira.

Revision ID: 84c02f5d3b17
Revises: 73b91e4c2a06

Não habilita endpoint de aprovação nem modifica decisões históricas.
"""

import sqlalchemy as sa

from alembic import op

revision = "84c02f5d3b17"
down_revision = "73b91e4c2a06"
branch_labels = None
depends_on = None

TABELA = "candidato_legado_decisao"


def upgrade() -> None:
    op.add_column(TABELA, sa.Column("recaptura_id", sa.BigInteger(), nullable=True))
    op.add_column(TABELA, sa.Column("convenio_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_legado_decisao_convenio",
        TABELA,
        "convenio",
        ["convenio_id"],
        ["id"],
        ondelete="RESTRICT",
        onupdate="RESTRICT",
    )
    op.create_foreign_key(
        "fk_legado_decisao_recaptura_identidade",
        TABELA,
        "candidato_legado_recaptura",
        ["recaptura_id", "captura_id", "candidato_id"],
        ["id", "captura_id", "candidato_id"],
        ondelete="RESTRICT",
        onupdate="RESTRICT",
    )
    op.create_unique_constraint("uq_legado_decisao_convenio", TABELA, ["convenio_id"])
    op.create_unique_constraint("uq_legado_decisao_recaptura", TABELA, ["recaptura_id"])
    op.create_check_constraint(
        "ck_legado_decisao_aprovacao_vinculos",
        TABELA,
        "(situacao = 'aprovado' AND recaptura_id IS NOT NULL AND convenio_id IS NOT NULL) OR "
        "(situacao <> 'aprovado' AND recaptura_id IS NULL AND convenio_id IS NULL)",
    )
    _situacoes(aprovacao=True)


def _situacoes(*, aprovacao: bool) -> None:
    for nome in ("ck_legado_decisao_situacao", "ck_legado_decisao_transicao"):
        op.drop_constraint(nome, TABELA, type_="check")
    permitidas = "('em_analise','rejeitado','aprovado')" if aprovacao else "('em_analise','rejeitado')"
    finais = "situacao IN ('rejeitado','aprovado')" if aprovacao else "situacao = 'rejeitado'"
    op.create_check_constraint("ck_legado_decisao_situacao", TABELA, f"situacao IN {permitidas}")
    op.create_check_constraint(
        "ck_legado_decisao_transicao", TABELA, f"(situacao = 'em_analise' AND situacao_anterior = 'novo') OR {finais}"
    )


def downgrade() -> None:
    op.execute("LOCK TABLE candidato_legado_decisao IN ACCESS EXCLUSIVE MODE")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM candidato_legado_decisao
                WHERE situacao = 'aprovado' OR recaptura_id IS NOT NULL OR convenio_id IS NOT NULL)
            THEN
                RAISE EXCEPTION 'Reversão bloqueada: aprovações auditadas do Radar'
                    USING ERRCODE = '23514';
            END IF;
        END $$;
    """)
    _situacoes(aprovacao=False)
    op.drop_constraint("ck_legado_decisao_aprovacao_vinculos", TABELA, type_="check")
    for nome in ("uq_legado_decisao_recaptura", "uq_legado_decisao_convenio"):
        op.drop_constraint(nome, TABELA, type_="unique")
    for nome in ("fk_legado_decisao_recaptura_identidade", "fk_legado_decisao_convenio"):
        op.drop_constraint(nome, TABELA, type_="foreignkey")
    op.drop_column(TABELA, "convenio_id")
    op.drop_column(TABELA, "recaptura_id")
