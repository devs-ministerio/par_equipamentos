"""Amplia monitoramento para PERSUS e PRONON.

Revision ID: 7c1f2e9a4b60
Revises: 01a01055b1af
Create Date: 2026-09-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7c1f2e9a4b60"
down_revision: str | None = "01a01055b1af"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("instrumento_equipamento", "cnpj_convenente", existing_type=sa.String(), nullable=True)
    op.add_column("instrumento_equipamento", sa.Column("origem_dado", sa.String(), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("tipologia", sa.String(length=3), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("investimento_aquisicao", sa.Numeric(16, 2), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("situacao_programa", sa.String(), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("natureza_servico", sa.String(), nullable=True))
    op.create_check_constraint(
        "ck_instrumento_equipamento_tipologia",
        "instrumento_equipamento",
        "tipologia IS NULL OR tipologia IN ('A', 'CV', 'C', 'EO', 'C.B', 'NA')",
    )
    op.create_check_constraint(
        "ck_instrumento_equipamento_investimento",
        "instrumento_equipamento",
        "investimento_aquisicao IS NULL OR investimento_aquisicao >= 0",
    )
    op.create_index(
        "idx_instrumento_equipamento_programa_situacao",
        "instrumento_equipamento",
        ["programa", "situacao_programa"],
    )


def downgrade() -> None:
    # Não apaga instrumentos nem fabrica CNPJ para satisfazer o schema
    # antigo. O operador precisa enriquecer/remover conscientemente as
    # linhas sem CNPJ antes de voltar esta migration.
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM instrumento_equipamento WHERE cnpj_convenente IS NULL) THEN
            RAISE EXCEPTION 'downgrade bloqueado: há instrumentos sem CNPJ; reconcilie-os antes';
          END IF;
        END $$
        """
    )
    op.drop_index("idx_instrumento_equipamento_programa_situacao", table_name="instrumento_equipamento")
    op.drop_constraint("ck_instrumento_equipamento_investimento", "instrumento_equipamento", type_="check")
    op.drop_constraint("ck_instrumento_equipamento_tipologia", "instrumento_equipamento", type_="check")
    op.drop_column("instrumento_equipamento", "natureza_servico")
    op.drop_column("instrumento_equipamento", "situacao_programa")
    op.drop_column("instrumento_equipamento", "investimento_aquisicao")
    op.drop_column("instrumento_equipamento", "tipologia")
    op.drop_column("instrumento_equipamento", "origem_dado")
    op.alter_column("instrumento_equipamento", "cnpj_convenente", existing_type=sa.String(), nullable=False)
