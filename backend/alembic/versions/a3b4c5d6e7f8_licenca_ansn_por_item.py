"""licenca_ansn_por_item

Marca as famílias que exigem licença da ANSN (`equipamento_catalogo.exige_licenca`) e liga o documento da ANSN ao
item do plano (`documento_instrumento.item_plano_id`, opcional: documentos antigos ficam só no instrumento).

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
    op.add_column("documento_instrumento", sa.Column("item_plano_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_documento_instrumento_item_plano",
        "documento_instrumento",
        "item_plano",
        ["item_plano_id"],
        ["id"],
        onupdate="RESTRICT",
        ondelete="SET NULL",
    )
    op.create_index("idx_documento_instrumento_item", "documento_instrumento", ["item_plano_id"])


def downgrade() -> None:
    op.drop_index("idx_documento_instrumento_item", table_name="documento_instrumento")
    op.drop_constraint("fk_documento_instrumento_item_plano", "documento_instrumento", type_="foreignkey")
    op.drop_column("documento_instrumento", "item_plano_id")
    op.drop_column("equipamento_catalogo", "exige_licenca")
