"""indice_unico_inauguracao

Uma inauguração ativa por instrumento (previsão, realizada ou dispensada). Exige a consolidação dos duplicados
antes (`scripts/consolidar_eventos_marco_duplicados.py --inauguracao --aplicar`); se houver duplicado, a migration
para com a mensagem do que fazer.

Revision ID: b9c0d1e2f3a4
Revises: b4c5d6e7f8a9
Create Date: 2026-11-19 16:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
from app.db.indices import INDICE_INAUGURACAO, garantir_indice_unico_inauguracao

revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    garantir_indice_unico_inauguracao(op.get_bind())


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {INDICE_INAUGURACAO}")
