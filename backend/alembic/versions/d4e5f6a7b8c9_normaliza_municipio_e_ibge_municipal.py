"""Adiciona chaves técnicas de município e IBGE municipal de seis dígitos.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("convenio", sa.Column("municipio_normalizado", sa.String(), nullable=True))
    op.add_column("convenio", sa.Column("codigo_ibge_municipio", sa.String(length=6), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("municipio_normalizado", sa.String(), nullable=True))
    op.add_column("proposta_candidata", sa.Column("municipio_normalizado", sa.String(), nullable=True))
    op.create_index("idx_convenio_municipio_normalizado", "convenio", ["municipio_normalizado"])
    op.create_index("idx_convenio_codigo_ibge_municipio", "convenio", ["codigo_ibge_municipio"])
    op.create_index("idx_instrumento_municipio_normalizado", "instrumento_equipamento", ["municipio_normalizado"])
    op.create_index("idx_proposta_municipio_normalizado", "proposta_candidata", ["municipio_normalizado"])


def downgrade() -> None:
    op.drop_index("idx_proposta_municipio_normalizado", table_name="proposta_candidata")
    op.drop_index("idx_instrumento_municipio_normalizado", table_name="instrumento_equipamento")
    op.drop_index("idx_convenio_codigo_ibge_municipio", table_name="convenio")
    op.drop_index("idx_convenio_municipio_normalizado", table_name="convenio")
    op.drop_column("proposta_candidata", "municipio_normalizado")
    op.drop_column("instrumento_equipamento", "municipio_normalizado")
    op.drop_column("convenio", "codigo_ibge_municipio")
    op.drop_column("convenio", "municipio_normalizado")
