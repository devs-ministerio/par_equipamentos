"""Alinha identidade textual à fonte SICONV e ao histórico preservado.

Revision ID: b7f35c806e4a
Revises: a6e24b7f5d39

Só formato; não altera critérios institucionais nem promove candidatos.
"""

from alembic import op

revision = "b7f35c806e4a"
down_revision = "a6e24b7f5d39"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_candidato_legado_identidade", "candidato_legado", type_="check")
    op.create_check_constraint(
        "ck_candidato_legado_identidade",
        "candidato_legado",
        "numero ~ '^[0-9A-Z]+$' AND id_proposta ~ '^[0-9]+$'",
    )


def downgrade() -> None:
    op.execute("LOCK TABLE candidato_legado IN ACCESS EXCLUSIVE MODE")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM candidato_legado WHERE numero !~ '^[0-9]+$') THEN
                RAISE EXCEPTION 'Reversão bloqueada: preserve identidades alfanuméricas'
                    USING ERRCODE='23514';
            END IF;
        END $$;
    """)
    op.drop_constraint("ck_candidato_legado_identidade", "candidato_legado", type_="check")
    op.create_check_constraint(
        "ck_candidato_legado_identidade",
        "candidato_legado",
        "numero ~ '^[0-9]+$' AND id_proposta ~ '^[0-9]+$'",
    )
