"""Remove equipamento_alias e execution_alert (tabelas mortas).

Confirmado por grep em toda a árvore `app/`/`scripts/` (Plan Mode fechamento
final 2026-09-25, Bloco 7 -- auditoria de database de 2026-09-24): nenhum
service/repository/script lê ou escreve em `equipamento_alias`;
`execution_alert` só é citada num comentário de `app/pipeline/runner.py`
explicando por que NÃO é usada ali. Decisão do usuário de descartar ambas
em vez de manter schema morto — não passou por nenhuma correção manual
(diferente de `instrumento_equipamento`, ver seção "Estratégia de dados do
Neon" em CLAUDE.md), então não há dado a preservar antes do DROP.

Revision ID: 9c2e4f7a1d38
Revises: 488a535a0b5e
Create Date: 2026-09-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9c2e4f7a1d38"
down_revision: Union[str, Sequence[str], None] = "488a535a0b5e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("equipamento_alias")

    op.drop_table("execution_alert")
    # Tipo nativo do Postgres é objeto separado da tabela -- só pode ser
    # removido depois que nenhuma coluna o referencia mais.
    op.execute("DROP TYPE alert_type")


def downgrade() -> None:
    alert_type = postgresql.ENUM(
        "municipality_exception",
        "macro_exception",
        "macro_code_divergence",
        name="alert_type",
    )
    alert_type.create(op.get_bind())

    op.create_table(
        "execution_alert",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "execution_id",
            sa.BigInteger(),
            sa.ForeignKey("execution.id", ondelete="CASCADE", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column("alert_type", alert_type, nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "equipamento_alias",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "equipamento_catalogo_id",
            sa.BigInteger(),
            sa.ForeignKey("equipamento_catalogo.id", ondelete="CASCADE", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column("alias_normalizado", sa.String(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("alias_normalizado", name="uq_equipamento_alias_normalizado"),
    )
