"""decisao_radar_guarda_titular

A aprovação do Radar exige o técnico titular. A decisão passa a guardar o titular aceito, para o reenvio
idempotente comparar com o original (o titular do instrumento pode ser reatribuído depois).

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-11-21 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("candidato_legado_decisao", sa.Column("tecnico_titular_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_legado_decisao_tecnico_titular",
        "candidato_legado_decisao",
        "user",
        ["tecnico_titular_id"],
        ["id"],
        ondelete="RESTRICT",
        onupdate="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_legado_decisao_tecnico_titular", "candidato_legado_decisao", type_="foreignkey")
    op.drop_column("candidato_legado_decisao", "tecnico_titular_id")
