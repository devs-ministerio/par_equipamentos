"""Explicita ON DELETE RESTRICT na FK de fase geral de evento.

A migration que introduziu a coluna declarava somente ON UPDATE RESTRICT.
PostgreSQL aplicava o default restritivo, mas a constituicao exige o contrato
explicito e alinhado ao model SQLAlchemy.

Revision ID: c4d6e8f0a123
Revises: a6b2c4d8e913
"""

from collections.abc import Sequence

from alembic import op


revision: str = "c4d6e8f0a123"
down_revision: str | None = "a6b2c4d8e913"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK_NAME = "evento_marco_fase_geral_id_fkey"


def upgrade() -> None:
    op.drop_constraint(FK_NAME, "evento_marco", type_="foreignkey")
    op.create_foreign_key(
        FK_NAME,
        "evento_marco",
        "marco_catalogo",
        ["fase_geral_id"],
        ["id"],
        ondelete="RESTRICT",
        onupdate="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(FK_NAME, "evento_marco", type_="foreignkey")
    op.create_foreign_key(
        FK_NAME,
        "evento_marco",
        "marco_catalogo",
        ["fase_geral_id"],
        ["id"],
        onupdate="RESTRICT",
    )
