"""adiciona distancia e horas ate radiofarmaco mais proximo em municipality_coverage

Revision ID: 8bbc3e31caad
Revises: 28c0d8de92f2
Create Date: 2026-08-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8bbc3e31caad'
down_revision: Union[str, Sequence[str], None] = '28c0d8de92f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('municipality_coverage', sa.Column('distance_km_nearest_radiopharma', sa.Numeric(), nullable=True))
    op.add_column('municipality_coverage', sa.Column('hours_road_nearest_radiopharma', sa.Numeric(), nullable=True))
    op.add_column('municipality_coverage', sa.Column('hours_air_nearest_radiopharma', sa.Numeric(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('municipality_coverage', 'hours_air_nearest_radiopharma')
    op.drop_column('municipality_coverage', 'hours_road_nearest_radiopharma')
    op.drop_column('municipality_coverage', 'distance_km_nearest_radiopharma')
