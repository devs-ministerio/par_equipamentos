"""Expansão dos avisos de descoberta e aprovação do Radar.

Revision ID: 95d13a6e4c28
Revises: 84c02f5d3b17

Rollback preserva expansão do enum, como nas revisões anteriores: contrair
exigiria reescrita bloqueante do tipo. Havendo avisos novos, bloqueia reversão.
"""

from alembic import op

revision = "95d13a6e4c28"
down_revision = "84c02f5d3b17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL exige commit antes de usar valores recém-adicionados.
    # IF NOT EXISTS permite retomar uma expansão parcialmente concluída.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'aprovacao_carteira'")
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'convenio_descoberto'")


def downgrade() -> None:
    op.execute("LOCK TABLE notificacao IN ACCESS EXCLUSIVE MODE")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM notificacao
                WHERE tipo::text IN ('aprovacao_carteira','convenio_descoberto')) THEN
                RAISE EXCEPTION 'Reversão bloqueada: preserve avisos do Radar'
                    USING ERRCODE = '23514';
            END IF;
        END $$;
    """)
    # Literais permanecem; nenhuma mensagem ou destinatário é excluído.
