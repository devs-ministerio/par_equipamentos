"""Centraliza catálogo e evidências de equipamentos.

Substitui progressivamente os marcadores derivados em JSONB por relações
consultáveis, preservando as colunas antigas durante o rollout.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


revision: str = "f4c7e1d9a820"
down_revision: str | None = "e39d87b25964"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "equipamento_catalogo",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("codigo", sa.String(), nullable=False),
        sa.Column("nome", sa.String(), nullable=False),
        sa.Column("prioritario", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("codigo", name="uq_equipamento_catalogo_codigo"),
        sa.UniqueConstraint("nome", name="uq_equipamento_catalogo_nome"),
    )
    op.create_table(
        "equipamento_alias",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("equipamento_catalogo_id", sa.BigInteger(), nullable=False),
        sa.Column("alias_normalizado", sa.String(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["equipamento_catalogo_id"], ["equipamento_catalogo.id"], ondelete="CASCADE", onupdate="RESTRICT"
        ),
        sa.UniqueConstraint("alias_normalizado", name="uq_equipamento_alias_normalizado"),
    )
    op.create_table(
        "equipamento_marcador",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("equipamento_catalogo_id", sa.BigInteger(), nullable=False),
        sa.Column("convenio_id", sa.BigInteger(), nullable=True),
        sa.Column("proposta_candidata_id", sa.BigInteger(), nullable=True),
        sa.Column("instrumento_equipamento_id", sa.BigInteger(), nullable=True),
        sa.Column("descricao_original", sa.String(), nullable=False),
        sa.Column("tipo_evidencia", sa.String(), nullable=False),
        sa.Column("relacao", sa.String(), nullable=False),
        sa.Column("confianca", sa.Integer(), nullable=False),
        sa.Column("chave_evidencia", sa.String(), nullable=False),
        sa.Column("origem_dado", sa.String(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "((convenio_id IS NOT NULL)::int + (proposta_candidata_id IS NOT NULL)::int + (instrumento_equipamento_id IS NOT NULL)::int) = 1",
            name="ck_equipamento_marcador_uma_origem",
        ),
        sa.CheckConstraint(
            "tipo_evidencia IN ('item_orcamentario', 'meta', 'objeto', 'planilha', 'programa', 'legado')",
            name="ck_equipamento_marcador_tipo_evidencia",
        ),
        sa.CheckConstraint(
            "relacao IN ('aquisicao', 'modernizacao', 'existente', 'mencao')", name="ck_equipamento_marcador_relacao"
        ),
        sa.CheckConstraint("confianca >= 0 AND confianca <= 100", name="ck_equipamento_marcador_confianca"),
        sa.ForeignKeyConstraint(
            ["equipamento_catalogo_id"], ["equipamento_catalogo.id"], ondelete="RESTRICT", onupdate="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["convenio_id"], ["convenio.id"], ondelete="CASCADE", onupdate="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["proposta_candidata_id"], ["proposta_candidata.id"], ondelete="CASCADE", onupdate="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["instrumento_equipamento_id"], ["instrumento_equipamento.id"], ondelete="CASCADE", onupdate="RESTRICT"
        ),
    )
    for index, column in (
        ("idx_equipamento_marcador_catalogo", "equipamento_catalogo_id"),
        ("idx_equipamento_marcador_convenio", "convenio_id"),
        ("idx_equipamento_marcador_proposta", "proposta_candidata_id"),
        ("idx_equipamento_marcador_instrumento", "instrumento_equipamento_id"),
    ):
        op.create_index(index, "equipamento_marcador", [column])
    op.create_index(
        "uq_equipamento_marcador_convenio",
        "equipamento_marcador",
        ["convenio_id", "equipamento_catalogo_id", "chave_evidencia"],
        unique=True,
        postgresql_where=sa.text("convenio_id IS NOT NULL"),
    )
    op.create_index(
        "uq_equipamento_marcador_proposta",
        "equipamento_marcador",
        ["proposta_candidata_id", "equipamento_catalogo_id", "chave_evidencia"],
        unique=True,
        postgresql_where=sa.text("proposta_candidata_id IS NOT NULL"),
    )
    op.create_index(
        "uq_equipamento_marcador_instrumento",
        "equipamento_marcador",
        ["instrumento_equipamento_id", "equipamento_catalogo_id", "chave_evidencia"],
        unique=True,
        postgresql_where=sa.text("instrumento_equipamento_id IS NOT NULL"),
    )

    op.bulk_insert(
        sa.table(
            "equipamento_catalogo",
            sa.column("codigo", sa.String()),
            sa.column("nome", sa.String()),
            sa.column("prioritario", sa.Boolean()),
        ),
        [
            {"codigo": "acelerador_linear", "nome": "Acelerador Linear", "prioritario": True},
            {"codigo": "mamografo", "nome": "Mamógrafo", "prioritario": True},
            {"codigo": "pet_ct", "nome": "PET/CT", "prioritario": True},
            {"codigo": "gama_camera_spect", "nome": "Gama-câmara/SPECT", "prioritario": True},
            {"codigo": "braquiterapia", "nome": "Braquiterapia", "prioritario": True},
            {"codigo": "ultrassom", "nome": "Ultrassom", "prioritario": False},
            {"codigo": "endoscopia", "nome": "Endoscopia", "prioritario": False},
            {"codigo": "tomografo", "nome": "Tomógrafo", "prioritario": False},
            {"codigo": "ressonancia", "nome": "Ressonância", "prioritario": False},
            {"codigo": "radioterapia", "nome": "Radioterapia", "prioritario": False},
            {"codigo": "raios_x", "nome": "Raios X", "prioritario": False},
            {"codigo": "hemodialise", "nome": "Hemodiálise", "prioritario": False},
            {"codigo": "angiografia", "nome": "Angiografia", "prioritario": False},
            {"codigo": "cobalto", "nome": "Cobalto", "prioritario": False},
        ],
    )
    # Aliases adicionais são dados de governança e entram por migration
    # própria após validação humana. Não dependemos da extensão opcional
    # ``unaccent`` nem inventamos sinônimos na carga estrutural.


def downgrade() -> None:
    op.drop_table("equipamento_marcador")
    op.drop_table("equipamento_alias")
    op.drop_table("equipamento_catalogo")
