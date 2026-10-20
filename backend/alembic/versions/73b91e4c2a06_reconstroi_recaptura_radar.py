"""Reconstrói prova oficial imutável, sem promover candidatos.

Revision ID: 73b91e4c2a06
Revises: 42d8a91c6f03

Payload é snapshot da fonte para auditoria, não substituto das relações.
Não reconstitui revisões perdidas nem admite reversão com provas existentes.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "73b91e4c2a06"
down_revision = "42d8a91c6f03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "candidato_legado_recaptura",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "candidato_id",
            sa.BigInteger(),
            sa.ForeignKey("candidato_legado.id", ondelete="RESTRICT", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column("captura_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "fonte_captura_id",
            sa.BigInteger(),
            sa.ForeignKey("fonte_captura.id", ondelete="RESTRICT", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column("hash_conteudo", sa.String(), nullable=False),
        sa.Column("situacao", sa.String(), nullable=False),
        sa.Column("valor_global", sa.Numeric(), nullable=False),
        sa.Column("payload_oficial", JSONB(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["captura_id", "candidato_id"],
            ["candidato_legado_captura.id", "candidato_legado_captura.candidato_id"],
            name="fk_legado_recaptura_captura_candidato",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.UniqueConstraint("id", "captura_id", "candidato_id", name="uq_legado_recaptura_identidade"),
        sa.UniqueConstraint("candidato_id", "fonte_captura_id", name="uq_legado_recaptura_rodada"),
        sa.CheckConstraint("hash_conteudo ~ '^[a-f0-9]{64}$'", name="ck_legado_recaptura_hash"),
        sa.CheckConstraint("length(btrim(situacao)) > 0", name="ck_legado_recaptura_situacao"),
        sa.CheckConstraint("valor_global >= 0", name="ck_legado_recaptura_valor"),
    )
    op.create_index("idx_legado_recaptura_captura", "candidato_legado_recaptura", ["captura_id"])
    op.create_index("idx_legado_recaptura_fonte", "candidato_legado_recaptura", ["fonte_captura_id"])
    # Mesma semântica do trigger confirmado no schema sobrevivente.
    op.execute("""
        CREATE FUNCTION impedir_mutacao_recaptura_legado() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Recaptura oficial é imutável'; END $$;
        CREATE TRIGGER recaptura_legado_append_only
            BEFORE UPDATE OR DELETE ON candidato_legado_recaptura
            FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_recaptura_legado();
    """)


def downgrade() -> None:
    op.execute("LOCK TABLE candidato_legado_recaptura IN ACCESS EXCLUSIVE MODE")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM candidato_legado_recaptura) THEN
                RAISE EXCEPTION 'Reversão bloqueada: provas oficiais do Radar'
                    USING ERRCODE = '23514';
            END IF;
        END $$;
    """)
    op.drop_table("candidato_legado_recaptura")
    op.execute("DROP FUNCTION impedir_mutacao_recaptura_legado()")
