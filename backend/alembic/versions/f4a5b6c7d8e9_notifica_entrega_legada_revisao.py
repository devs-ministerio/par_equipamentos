"""Notificação de entrega registrada antes do controle por unidade.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-10-23 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "f4a5b6c7d8e9"
down_revision: Union[str, Sequence[str], None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL só aceita usar o valor novo após commit.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'entrega_legada_revisao'")


def downgrade() -> None:
    # Valor de enum não se remove com segurança no PostgreSQL; o downgrade é neutro de propósito.
    pass
