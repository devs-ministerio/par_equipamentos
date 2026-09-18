"""corrige_escopo_instrumentos_firmados

Correção do Plan Mode monitoramento-ingestao (2026-09-18): a carga de FAF/
TED/PERSUS I/PERSUS II/PRONON tinha gravado tudo só em
`instrumento_equipamento` (monitoramento interno). O universo correto é
`convenio` ("Instrumentos firmados") pra todos eles; só permanecem também
no monitoramento interno o que a equipe já cadastrava (Convênio/FAF/TED) e
PERSUS I ainda não concluído. Esta migration só prepara o schema -- a
migração de dados roda em `scripts/corrigir_escopo_instrumentos_firmados.py`.

Revision ID: 26becbd31f95
Revises: 8d2e4f6a1b90
Create Date: 2026-09-18 11:31:09.631685

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '26becbd31f95'
down_revision: Union[str, Sequence[str], None] = '8d2e4f6a1b90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column("convenio", "convenente_cnpj", existing_type=sa.String(), nullable=True)
    op.add_column("convenio", sa.Column("tipo_contratacao", sa.String(), nullable=True))
    op.add_column("convenio", sa.Column("origem_dado", sa.String(), nullable=True))
    op.add_column("convenio", sa.Column("chave_origem", sa.String(), nullable=True))
    op.create_unique_constraint("uq_convenio_chave_origem", "convenio", ["chave_origem"])
    op.execute("UPDATE convenio SET tipo_contratacao = 'Convênio' WHERE tipo_contratacao IS NULL")

    op.add_column("instrumento_equipamento", sa.Column("chave_origem", sa.String(), nullable=True))
    op.create_unique_constraint(
        "uq_instrumento_equipamento_chave_origem", "instrumento_equipamento", ["chave_origem"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "uq_instrumento_equipamento_chave_origem", "instrumento_equipamento", type_="unique"
    )
    op.drop_column("instrumento_equipamento", "chave_origem")

    op.drop_constraint("uq_convenio_chave_origem", "convenio", type_="unique")
    op.drop_column("convenio", "chave_origem")
    op.drop_column("convenio", "origem_dado")
    op.drop_column("convenio", "tipo_contratacao")
    op.alter_column("convenio", "convenente_cnpj", existing_type=sa.String(), nullable=False)
