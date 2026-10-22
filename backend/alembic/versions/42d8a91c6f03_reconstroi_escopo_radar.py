"""Reconstrução aditiva do escopo oficial e componentes do Radar.

Revision ID: 42d8a91c6f03
Revises: b5c6d7e8f9a0

Não substitui revisões perdidas nem promove capturas históricas a evidência
oficial. Reversão bloqueada quando descartaria evidência nova.
"""

import sqlalchemy as sa

from alembic import op

revision = "42d8a91c6f03"
down_revision = "b5c6d7e8f9a0"
branch_labels = None
depends_on = None

TABELA = "candidato_legado_captura"
CHECKS = {
    "ck_legado_criterio_escopo": "criterio_escopo IS NULL OR criterio_escopo IN ('prioritarios_ms_v1','prioritarios_ms_celebrados_v2')",
    "ck_legado_orgao_escopo": "(criterio_escopo IS NULL AND orgao_superior IS NULL) OR (criterio_escopo IS NOT NULL AND orgao_superior IS NOT NULL AND orgao_superior = '36000')",
    "ck_legado_celebracao_siconv": "criterio_escopo IS DISTINCT FROM 'prioritarios_ms_celebrados_v2' OR (data_assinatura_siconv IS NOT NULL AND data_publicacao_siconv IS NOT NULL)",
    "ck_legado_inelegibilidade_rodada": "(elegivel AND motivo_inelegibilidade IS NULL) OR (NOT elegivel AND motivo_inelegibilidade IS NOT NULL AND motivo_inelegibilidade = 'fora_recorte_oficial' AND fonte_captura_id IS NOT NULL)",
}


def upgrade() -> None:
    for coluna in (
        sa.Column("criterio_escopo", sa.String(), nullable=True),
        sa.Column("orgao_superior", sa.String(), nullable=True),
        sa.Column("data_assinatura_siconv", sa.Date(), nullable=True),
        sa.Column("data_publicacao_siconv", sa.Date(), nullable=True),
        sa.Column("elegivel", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("motivo_inelegibilidade", sa.String(32), nullable=True),
        sa.Column("fonte_captura_id", sa.BigInteger(), nullable=True),
    ):
        op.add_column(TABELA, coluna)
    op.create_foreign_key(
        "fk_legado_captura_fonte",
        TABELA,
        "fonte_captura",
        ["fonte_captura_id"],
        ["id"],
        ondelete="RESTRICT",
        onupdate="RESTRICT",
    )
    op.create_index("idx_legado_captura_fonte", TABELA, ["fonte_captura_id"])
    for nome, expressao in CHECKS.items():
        op.create_check_constraint(nome, TABELA, expressao)
    op.create_table(
        "candidato_legado_componente",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "captura_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{TABELA}.id", ondelete="RESTRICT", onupdate="RESTRICT"),
            nullable=False,
        ),
        sa.Column("id_programa", sa.String(), nullable=False),
        sa.Column("nome_programa", sa.String(), nullable=False),
        sa.Column("componente", sa.String(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("captura_id", "id_programa", "nome_programa", name="uq_legado_componente_programa"),
        sa.CheckConstraint("id_programa ~ '^[0-9]+$'", name="ck_legado_componente_programa"),
    )
    op.create_index("idx_legado_componente_captura", "candidato_legado_componente", ["captura_id"])


def downgrade() -> None:
    # O lock cobre a checagem e o DDL na mesma transação: uma escrita
    # concorrente não pode introduzir evidência entre ambos.
    op.execute("LOCK TABLE candidato_legado_captura, candidato_legado_componente IN ACCESS EXCLUSIVE MODE")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM candidato_legado_componente)
            OR EXISTS (SELECT 1 FROM candidato_legado_captura
                WHERE criterio_escopo IS NOT NULL OR orgao_superior IS NOT NULL
                OR data_assinatura_siconv IS NOT NULL OR data_publicacao_siconv IS NOT NULL
                OR NOT elegivel OR motivo_inelegibilidade IS NOT NULL OR fonte_captura_id IS NOT NULL)
            THEN
                RAISE EXCEPTION 'Reversão bloqueada: preservação de evidências do Radar'
                    USING ERRCODE = '23514';
            END IF;
        END $$;
    """)
    op.drop_table("candidato_legado_componente")
    for nome in CHECKS:
        op.drop_constraint(nome, TABELA, type_="check")
    op.drop_index("idx_legado_captura_fonte", table_name=TABELA)
    op.drop_constraint("fk_legado_captura_fonte", TABELA, type_="foreignkey")
    for nome in (
        "fonte_captura_id",
        "motivo_inelegibilidade",
        "elegivel",
        "data_publicacao_siconv",
        "data_assinatura_siconv",
        "orgao_superior",
        "criterio_escopo",
    ):
        op.drop_column(TABELA, nome)
