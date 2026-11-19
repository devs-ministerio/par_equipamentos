"""exige_licenca_familia

Marca as famílias que exigem licença da ANSN (`equipamento_catalogo.exige_licenca`). A licença vale para o
estabelecimento (CNES), não para o equipamento: não há vínculo com o item do plano.

Revision ID: a3b4c5d6e7f8
Revises: a8b9c0d1e2f3
Create Date: 2026-11-19 18:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FAMILIAS_COM_LICENCA = (
    "acelerador_linear",
    "braquiterapia",
    "cobalto",
    "radioterapia",
    "pet_ct",
    "gama_camera_spect",
)


def upgrade() -> None:
    op.add_column(
        "equipamento_catalogo",
        sa.Column("exige_licenca", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.execute(
        sa.text("UPDATE equipamento_catalogo SET exige_licenca = true WHERE codigo = ANY(:codigos)").bindparams(
            codigos=list(FAMILIAS_COM_LICENCA)
        )
    )


def downgrade() -> None:
    op.drop_column("equipamento_catalogo", "exige_licenca")
