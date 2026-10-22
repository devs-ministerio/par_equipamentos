"""Aviso gerencial de entrada na carteira, separado de monitoramento interno.

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
"""

import sqlalchemy as sa
from alembic import op

revision = "f0a1b2c3d4e5"
down_revision = "e9f0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'aprovacao_carteira'")


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM notificacao WHERE tipo::text = 'aprovacao_carteira'")):
        raise RuntimeError("Rollback bloqueado: preserve os avisos de aprovação antes de reverter a aplicação.")
    # Expansão do enum é mantida, como nas migrations anteriores de avisos.
    # Remover o literal exige recriar o tipo e bloquear a tabela: contração
    # fica em migration separada, não necessária ao rollback sem novas linhas.
