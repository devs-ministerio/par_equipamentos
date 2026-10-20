"""Avisos de descoberta confirmada, separados de aprovação e monitoramento."""

import sqlalchemy as sa
from alembic import op

revision = "e6a7b8c9d0f1"
down_revision = "d5f6a7b8c9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'convenio_descoberto'")


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM notificacao WHERE tipo::text = 'convenio_descoberto')")):
        raise RuntimeError("Preserve os avisos de descoberta antes de reverter a aplicação.")
    # Expansão mantida, conforme migrations anteriores. Contrair o enum exige
    # recriar o tipo e bloquear a tabela; não faz parte deste rollback seguro.
