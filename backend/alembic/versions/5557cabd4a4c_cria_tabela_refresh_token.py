"""cria_tabela_refresh_token

Revision ID: 5557cabd4a4c
Revises: 9d2e13b1f93a
Create Date: 2026-09-16 23:52:13.869696

Bloco 2 do Plan Mode database (Rodada 2/3): fecha o drift apontado pelo
diagnóstico -- `RefreshToken` já existia em `app/db/models.py` sem migration
correspondente. Tabela nova e vazia, migration puramente aditiva. Pré-requisito
de infraestrutura para o Bloco 2 do Plan Mode de segurança (sessão com refresh
rotativo).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5557cabd4a4c"
down_revision: Union[str, Sequence[str], None] = "9d2e13b1f93a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "refresh_token",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_token")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            name="fk_refresh_token_user",
            ondelete="CASCADE",
            onupdate="RESTRICT",
        ),
        sa.UniqueConstraint("token_hash", name="uq_refresh_token_token_hash"),
    )
    op.create_index("idx_refresh_token_user", "refresh_token", ["user_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_refresh_token_user", table_name="refresh_token")
    op.drop_table("refresh_token")
