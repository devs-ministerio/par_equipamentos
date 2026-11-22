"""marco_inauguracao_dispensada

Revision ID: f6a7b8c9d0e2
Revises: e5f6a7b8c9d1
Create Date: 2026-11-19 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "f6a7b8c9d0e2"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO marco_catalogo (codigo, grupo, rotulo)
        SELECT 'cronograma_inauguracao_dispensada', 'cronograma_fisico', 'Inauguração dispensada'
        WHERE NOT EXISTS (SELECT 1 FROM marco_catalogo WHERE codigo = 'cronograma_inauguracao_dispensada')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM marco_catalogo
        WHERE codigo = 'cronograma_inauguracao_dispensada'
          AND NOT EXISTS (
              SELECT 1 FROM evento_marco e JOIN marco_catalogo m ON m.id = e.marco_id
              WHERE m.codigo = 'cronograma_inauguracao_dispensada'
          )
        """
    )
