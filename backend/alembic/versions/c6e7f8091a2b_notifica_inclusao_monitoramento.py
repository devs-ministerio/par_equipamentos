"""notifica inclusão explícita no monitoramento interno

Revision ID: c6e7f8091a2b
Revises: f7a8b9c0d1e2
Create Date: 2026-10-06
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c6e7f8091a2b"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'inclusao_monitoramento'")


def downgrade() -> None:
    # PostgreSQL não remove valor de enum sem recriar o tipo. Tal como na
    # migration 488a535a0b5e, o rollback de schema não elimina o valor;
    # um rollback de aplicação com linhas deste tipo exige tratá-las antes.
    pass
