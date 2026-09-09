"""adiciona numero_documento e data_validade em evento_marco

Revision ID: a9cd77597629
Revises: a1f2b3c4d5e6
Create Date: 2026-09-09 16:13:14.729452

Achado 2026-09-09: o numero da matricula CNEN (ex. "16981") estava sendo
gravado dentro de `status_regulatorio` no seed (scripts/seed_monitoramento.py)
-- campo documentado como vocabulario de STATUS (NI/NA/Em analise/Deferido/
Indeferido), nao pra numero de documento. Essa migration adiciona a coluna
certa (`numero_documento`) + `data_validade` (licenca CNEN tem prazo) E
corrige em uma tacada o dado ja gravado com esse defeito -- so pra linha que
bate exatamente no padrao (marco de matricula CNEN + status 100% numerico),
nunca um UPDATE generico que possa pegar status de verdade (Deferido etc.)
por engano.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9cd77597629'
down_revision: Union[str, Sequence[str], None] = 'a1f2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('evento_marco', sa.Column('numero_documento', sa.String(), nullable=True))
    op.add_column('evento_marco', sa.Column('data_validade', sa.Date(), nullable=True))

    # Backfill: move numero da matricula CNEN de status_regulatorio (onde
    # foi gravado por engano no seed) pra numero_documento. So afeta linha
    # cujo status_regulatorio e puramente numerico E cujo marco e
    # 'regulatorio_matricula_cnen' -- nunca toca status de verdade.
    op.execute("""
        UPDATE evento_marco
        SET numero_documento = status_regulatorio, status_regulatorio = NULL
        FROM marco_catalogo
        WHERE evento_marco.marco_id = marco_catalogo.id
          AND marco_catalogo.codigo = 'regulatorio_matricula_cnen'
          AND evento_marco.status_regulatorio ~ '^[0-9]+$'
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('evento_marco', 'data_validade')
    op.drop_column('evento_marco', 'numero_documento')
