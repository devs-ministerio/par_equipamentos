"""Cria evidência relacional auditável do TransfereGov.

Mantém o JSON compatível em ``proposta_candidata.metas_resumo`` durante a
migração de leitores, mas registra cada nó da árvore em linhas consultáveis.

Revision ID: b7e3d9f4a621
Revises: c4d6e8f0a123
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b7e3d9f4a621"
down_revision: str | None = "c4d6e8f0a123"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "evidencia_transferegov",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("proposta_candidata_id", sa.BigInteger(), nullable=False),
        sa.Column("tipo_recurso", sa.String(), nullable=False),
        sa.Column("chave_externa", sa.String(), nullable=False),
        sa.Column("caminho", sa.String(), nullable=False),
        sa.Column("caminho_pai", sa.String(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("hash_conteudo", sa.String(length=64), nullable=False),
        sa.Column("capturado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["proposta_candidata_id"], ["proposta_candidata.id"], ondelete="CASCADE", onupdate="RESTRICT"
        ),
        sa.UniqueConstraint("proposta_candidata_id", "caminho", name="uq_evidencia_transferegov_proposta_caminho"),
    )
    op.create_index(
        "idx_evidencia_transferegov_proposta_tipo",
        "evidencia_transferegov",
        ["proposta_candidata_id", "tipo_recurso"],
    )
    op.create_index("idx_evidencia_transferegov_chave", "evidencia_transferegov", ["tipo_recurso", "chave_externa"])


def downgrade() -> None:
    op.drop_index("idx_evidencia_transferegov_chave", table_name="evidencia_transferegov")
    op.drop_index("idx_evidencia_transferegov_proposta_tipo", table_name="evidencia_transferegov")
    op.drop_table("evidencia_transferegov")
