"""licenca_ansn_por_estabelecimento

Fonte oficial da licença de operação: instalações da ANSN (matrícula) e vínculo delas com o estabelecimento (CNES).

Revision ID: c8d9e0f1a2b3
Revises: b9c0d1e2f3a4
Create Date: 2026-11-19 20:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "instalacao_ansn",
        sa.Column("matricula", sa.String(), nullable=False),
        sa.Column("designacao", sa.String(), nullable=False),
        sa.Column("cidade", sa.String(), nullable=True),
        sa.Column("uf", sa.String(length=2), nullable=True),
        sa.Column("area_atuacao", sa.String(), nullable=True),
        sa.Column("setor_atuacao", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("validade", sa.Date(), nullable=True),
        sa.Column("consultado_em", sa.Date(), nullable=False),
        sa.Column("primeira_consulta_em", sa.Date(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("matricula"),
        sa.CheckConstraint("status IN ('valida', 'suspensa')", name="ck_instalacao_ansn_status"),
    )
    op.create_index("idx_instalacao_ansn_area", "instalacao_ansn", ["area_atuacao"])
    op.create_table(
        "vinculo_licenca_estabelecimento",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("cnes", sa.String(length=7), nullable=False),
        sa.Column("matricula", sa.String(), nullable=False),
        sa.Column("origem", sa.String(), server_default=sa.text("'carga'"), nullable=False),
        sa.Column("autor_id", sa.BigInteger(), nullable=True),
        sa.Column("deletado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletado_por_id", sa.BigInteger(), nullable=True),
        sa.Column("motivo_exclusao", sa.String(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["cnes"], ["cnes_estabelecimento.cnes"], onupdate="RESTRICT", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["autor_id"], ["user.id"], onupdate="RESTRICT", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["deletado_por_id"], ["user.id"], onupdate="RESTRICT", ondelete="SET NULL"),
    )
    op.create_index("idx_vinculo_licenca_cnes", "vinculo_licenca_estabelecimento", ["cnes"])
    op.create_index(
        "uq_vinculo_licenca_ativo",
        "vinculo_licenca_estabelecimento",
        ["cnes", "matricula"],
        unique=True,
        postgresql_where=sa.text("deletado_em IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_vinculo_licenca_ativo", table_name="vinculo_licenca_estabelecimento")
    op.drop_index("idx_vinculo_licenca_cnes", table_name="vinculo_licenca_estabelecimento")
    op.drop_table("vinculo_licenca_estabelecimento")
    op.drop_index("idx_instalacao_ansn_area", table_name="instalacao_ansn")
    op.drop_table("instalacao_ansn")
