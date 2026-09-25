"""Notificação por destinatário e alerta de fim de vigência.

Revision ID: 488a535a0b5e
Revises: 7fd36a4d65a5
Create Date: 2026-09-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "488a535a0b5e"
down_revision: Union[str, Sequence[str], None] = "7fd36a4d65a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL só aceita usar o valor novo após commit -- mesmo cuidado já
    # aplicado em 7fd36a4d65a5 (ALTER TYPE user_role ADD VALUE 'gestor').
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS 'alerta_vigencia'")

    op.create_table(
        "notificacao_destinatario",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("notificacao_id", sa.BigInteger(), nullable=False),
        sa.Column("usuario_id", sa.BigInteger(), nullable=False),
        sa.Column("lida", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("lida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["notificacao_id"], ["notificacao.id"], ondelete="CASCADE", onupdate="RESTRICT"),
        sa.ForeignKeyConstraint(["usuario_id"], ["user.id"], ondelete="CASCADE", onupdate="RESTRICT"),
        sa.UniqueConstraint("notificacao_id", "usuario_id", name="uq_notificacao_destinatario_usuario"),
    )
    op.create_index(
        "idx_notificacao_destinatario_usuario_lida",
        "notificacao_destinatario",
        ["usuario_id", "lida", "created_at"],
    )

    # Notificacao.lida (coluna antiga, compartilhada por toda a equipe) fica
    # deprecated -- nenhum código novo lê/escreve nela, "lida" agora vive por
    # usuário em notificacao_destinatario. Não removida nesta migration
    # (mesmo critério de contrato morto documentado no projeto: confirmar
    # ausência de consumidor antes de dropar coluna, numa migration própria
    # futura). Notificações pré-existentes não ganham destinatário retroativo
    # (não dá pra reconstruir com certeza quem era titular/suplente no
    # momento em que cada uma foi gerada) -- ficam invisíveis no GET
    # /notificacoes escopado por usuário, mesmo critério já usado na reversão
    # do 877881 e outras migrations deste projeto.


def downgrade() -> None:
    op.drop_index("idx_notificacao_destinatario_usuario_lida", table_name="notificacao_destinatario")
    op.drop_table("notificacao_destinatario")
    # Valores de enum PostgreSQL não são removíveis sem reconstruir o tipo e
    # podem já estar referenciados por notificações criadas após este
    # upgrade. O downgrade preserva o valor 'alerta_vigencia' (mesmo critério
    # de 7fd36a4d65a5 pro valor 'gestor').
