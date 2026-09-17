"""alinha_cnes_estabelecimento_geolocalizacao

Revision ID: e3a9c5b7d2f1
Revises: 728d0f835ed7
Create Date: 2026-09-16 15:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3a9c5b7d2f1'
down_revision: Union[str, Sequence[str], None] = '728d0f835ed7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('cnes_estabelecimento', sa.Column('latitude', sa.Numeric(), nullable=True))
    op.add_column('cnes_estabelecimento', sa.Column('longitude', sa.Numeric(), nullable=True))
    op.add_column('cnes_estabelecimento', sa.Column('fonte_sincronizacao', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('cnes_estabelecimento', 'fonte_sincronizacao')
    op.drop_column('cnes_estabelecimento', 'longitude')
    op.drop_column('cnes_estabelecimento', 'latitude')
