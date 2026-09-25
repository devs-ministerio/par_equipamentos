"""adiciona dados fisicos do equipamento em instrumento_equipamento

Revision ID: 94b982652d0e
Revises: a9cd77597629
Create Date: 2026-09-09 18:35:26.859768

Achado 2026-09-09: `equipamento_descricao` e o equipamento PLANEJADO (o que
o SICONV/plano de aplicacao diz que ia ser comprado) -- nunca deve ser
editado pela pagina de monitoramento. Essas 4 colunas novas sao o
equipamento FISICO de verdade, informado pelo estabelecimento de saude
DEPOIS da entrega -- etapa preparatoria pra futuramente monitorar o
equipamento entregue com dado real, nao so o que SICONV/TransfereGov
planejaram.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "94b982652d0e"
down_revision: Union[str, Sequence[str], None] = "a9cd77597629"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("instrumento_equipamento", sa.Column("equipamento_marca", sa.String(), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("equipamento_modelo", sa.String(), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("equipamento_numero_serie", sa.String(), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("equipamento_vida_util_anos", sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("instrumento_equipamento", "equipamento_vida_util_anos")
    op.drop_column("instrumento_equipamento", "equipamento_numero_serie")
    op.drop_column("instrumento_equipamento", "equipamento_modelo")
    op.drop_column("instrumento_equipamento", "equipamento_marca")
