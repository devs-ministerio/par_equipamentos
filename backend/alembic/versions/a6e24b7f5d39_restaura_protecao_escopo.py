"""Restaura marcação de exclusão e limites confirmados no clone preservado.

Revision ID: a6e24b7f5d39
Revises: 95d13a6e4c28

Não reclassifica registros nem copia decisões do clone para outros bancos.
"""

import sqlalchemy as sa

from alembic import op

revision = "a6e24b7f5d39"
down_revision = "95d13a6e4c28"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("LOCK TABLE candidato_legado_captura, candidato_legado_recaptura IN ACCESS EXCLUSIVE MODE")
    # Rejeitar dado incompatível, nunca truncar evidência silenciosamente.
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM candidato_legado_captura
                WHERE length(criterio_escopo)>32 OR length(orgao_superior)>5)
            OR EXISTS (SELECT 1 FROM candidato_legado_recaptura WHERE length(hash_conteudo)>64)
            THEN RAISE EXCEPTION 'Limites incompatíveis com evidências existentes'
                USING ERRCODE='23514';
            END IF;
        END $$;
    """)
    op.alter_column("candidato_legado_captura", "criterio_escopo", existing_type=sa.String(), type_=sa.String(32))
    op.alter_column("candidato_legado_captura", "orgao_superior", existing_type=sa.String(), type_=sa.String(5))
    op.alter_column("candidato_legado_recaptura", "hash_conteudo", existing_type=sa.String(), type_=sa.String(64))
    op.add_column(
        "convenio", sa.Column("fora_escopo_equipamentos", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    op.execute("LOCK TABLE convenio IN ACCESS EXCLUSIVE MODE")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM convenio WHERE fora_escopo_equipamentos) THEN
                RAISE EXCEPTION 'Reversão bloqueada: preserve as exclusões de escopo'
                    USING ERRCODE='23514';
            END IF;
        END $$;
    """)
    op.drop_column("convenio", "fora_escopo_equipamentos")
    op.alter_column("candidato_legado_recaptura", "hash_conteudo", existing_type=sa.String(64), type_=sa.String())
    op.alter_column("candidato_legado_captura", "orgao_superior", existing_type=sa.String(5), type_=sa.String())
    op.alter_column("candidato_legado_captura", "criterio_escopo", existing_type=sa.String(32), type_=sa.String())
