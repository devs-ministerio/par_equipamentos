"""Aceita números alfanuméricos publicados pelo SICONV no Radar.

Revision ID: a1c2d3e4f5b6
Revises: f0a1b2c3d4e5
"""

import sqlalchemy as sa
from alembic import op

revision = "a1c2d3e4f5b6"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_candidato_legado_identidade", "candidato_legado", type_="check")
    op.create_check_constraint(
        "ck_candidato_legado_identidade", "candidato_legado", "numero ~ '^[0-9A-Z]+$' AND id_proposta ~ '^[0-9]+$'"
    )


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM candidato_legado WHERE numero !~ '^[0-9]+$')")):
        raise RuntimeError("Rollback bloqueado: preserve o histórico de convênios alfanuméricos antes de reverter.")
    op.drop_constraint("ck_candidato_legado_identidade", "candidato_legado", type_="check")
    op.create_check_constraint(
        "ck_candidato_legado_identidade", "candidato_legado", "numero ~ '^[0-9]+$' AND id_proposta ~ '^[0-9]+$'"
    )
