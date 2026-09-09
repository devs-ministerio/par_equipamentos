"""adiciona tabela acao_monitoramento

Revision ID: b5ce2ad8f332
Revises: 94b982652d0e
Create Date: 2026-09-09 18:55:49.665590

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5ce2ad8f332'
down_revision: Union[str, Sequence[str], None] = '94b982652d0e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'acao_monitoramento',
        sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column('instrumento_id', sa.BigInteger(), nullable=False),
        sa.Column('descricao', sa.String(), nullable=False),
        sa.Column('data_prevista', sa.Date(), nullable=True),
        sa.Column('data_conclusao', sa.Date(), nullable=True),
        sa.Column('responsavel', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['instrumento_id'], ['instrumento_equipamento.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_acao_monitoramento_instrumento', 'acao_monitoramento',
        ['instrumento_id', 'data_prevista'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_acao_monitoramento_instrumento', table_name='acao_monitoramento')
    op.drop_table('acao_monitoramento')
