"""adiciona latitude, longitude e legal_nature em equipment_offer_row

Revision ID: 5066a7877a2c
Revises: 06e73a1db53b
Create Date: 2026-08-21 21:15:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5066a7877a2c"
down_revision: Union[str, Sequence[str], None] = "06e73a1db53b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("equipment_offer_row", sa.Column("latitude", sa.Numeric(), nullable=True))
    op.add_column("equipment_offer_row", sa.Column("longitude", sa.Numeric(), nullable=True))
    op.add_column("equipment_offer_row", sa.Column("legal_nature", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("equipment_offer_row", "legal_nature")
    op.drop_column("equipment_offer_row", "longitude")
    op.drop_column("equipment_offer_row", "latitude")
