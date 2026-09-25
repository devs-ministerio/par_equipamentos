"""Adiciona gestor, usuários iniciais e responsáveis relacionais.

Revision ID: 7fd36a4d65a5
Revises: b7e3d9f4a621
Create Date: 2026-09-25 10:18:28.391458

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7fd36a4d65a5"
down_revision: Union[str, Sequence[str], None] = "b7e3d9f4a621"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL só aceita usar o valor novo após commit; o bloco isolado
    # evita ``unsafe use of new value`` no seed de gestores abaixo.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gestor'")
    op.create_table(
        "instrumento_responsavel",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("instrumento_id", sa.BigInteger(), nullable=False),
        sa.Column("usuario_id", sa.BigInteger(), nullable=False),
        sa.Column("papel", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("papel IN ('titular', 'suplente')", name="ck_instrumento_responsavel_papel"),
        sa.ForeignKeyConstraint(
            ["instrumento_id"], ["instrumento_equipamento.id"], ondelete="CASCADE", onupdate="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["usuario_id"], ["user.id"], ondelete="RESTRICT", onupdate="RESTRICT"),
        sa.UniqueConstraint("instrumento_id", "usuario_id", name="uq_instrumento_responsavel_usuario"),
        sa.UniqueConstraint("instrumento_id", "papel", name="uq_instrumento_responsavel_papel"),
    )
    op.create_index("idx_instrumento_responsavel_usuario", "instrumento_responsavel", ["usuario_id", "instrumento_id"])

    usuarios = [
        ("Bruna Machado De Freitas Brito", "bruna.machado@saude.gov.br", "colaborador"),
        ("Leonardo Barroso Hardman Vianna", "leonardo.vianna@saude.gov.br", "colaborador"),
        ("Leonardo Augusto Barsante Santos", "leonardo.augusto@saude.gov.br", "colaborador"),
        ("Priscila Gomes Mariano Muniz", "priscila.muniz@saude.gov.br", "colaborador"),
        ("Samuel Ribeiro De Oliveira", "samuel.oliveira@saude.gov.br", "colaborador"),
        ("Flavio de Paula Araujo", "flavio.paula@saude.gov.br", "colaborador"),
        ("Janainny Magalhães Fernandes", "janainny.fernandes@saude.gov.br", "gestor"),
        ("Thiago Rodrigues Santos", "thiago.rodrigues@saude.gov.br", "gestor"),
    ]
    for nome, email, papel in usuarios:
        op.execute(
            sa.text(
                """
                INSERT INTO "user" (name, email, password_hash, role, status)
                VALUES (:nome, :email, '!convite-pendente-sem-senha!', CAST(:papel AS user_role), 'inactive')
                ON CONFLICT (email) DO NOTHING
                """
            ).bindparams(nome=nome, email=email, papel=papel)
        )

    # Só nomes de técnico confirmados pelo usuário entram no backfill. Layane
    # e Louise não possuem identidade autorizada e serão limpas abaixo.
    aliases = {
        "bruna.machado@saude.gov.br": ["BRUNA", "BRUNA MACHADO"],
        "leonardo.augusto@saude.gov.br": ["LEONARDO BARSANTE"],
        "priscila.muniz@saude.gov.br": ["PRISCILA"],
        "samuel.oliveira@saude.gov.br": ["SAMUEL"],
    }
    for email, nomes in aliases.items():
        for coluna, papel in (("tecnico_titular", "titular"), ("tecnico_suplente", "suplente")):
            op.execute(
                sa.text(
                    f"""
                    INSERT INTO instrumento_responsavel (instrumento_id, usuario_id, papel)
                    SELECT instrumento.id, usuario.id, :papel
                    FROM instrumento_equipamento AS instrumento
                    JOIN "user" AS usuario ON usuario.email = :email
                    WHERE instrumento.{coluna} = ANY(:nomes)
                    ON CONFLICT DO NOTHING
                    """
                ).bindparams(
                    sa.bindparam("nomes", value=nomes, type_=postgresql.ARRAY(sa.String())),
                    email=email,
                    papel=papel,
                ),
            )

    # Não há identidade autorizada para Layane/Louise. Limpa o texto legado
    # para que o painel as apresente como responsáveis não definidos, em vez
    # de sugerir uma atribuição que não pode ser autorizada relacionalmente.
    op.execute(
        sa.text(
            """
            UPDATE instrumento_equipamento
            SET tecnico_titular = NULL
            WHERE tecnico_titular IN ('LAYANE', 'LOUISE')
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE instrumento_equipamento
            SET tecnico_suplente = NULL
            WHERE tecnico_suplente IN ('LAYANE', 'LOUISE')
            """
        )
    )


def downgrade() -> None:
    op.drop_index("idx_instrumento_responsavel_usuario", table_name="instrumento_responsavel")
    op.drop_table("instrumento_responsavel")
    # Valores de enum PostgreSQL não são removíveis sem reconstruir o tipo e
    # podem já estar referenciados por usuários criados após este upgrade.
    # O downgrade preserva o valor `gestor` para não corromper identidades.
