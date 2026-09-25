"""adiciona tabelas de monitoramento de equipamento (pos-repasse)

Revision ID: a1f2b3c4d5e6
Revises: 8bbc3e31caad
Create Date: 2026-09-03 14:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1f2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "8bbc3e31caad"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "marco_catalogo",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("codigo", sa.String(), nullable=False),
        sa.Column(
            "grupo", sa.Enum("fase_geral", "cronograma_fisico", "regulatorio", name="marco_grupo"), nullable=False
        ),
        sa.Column("ordem", sa.Integer(), nullable=True),
        sa.Column("execucao_fisica_pct_referencia", sa.Numeric(), nullable=True),
        sa.Column("rotulo", sa.String(), nullable=False),
        sa.Column("descricao_referencia", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo"),
    )

    op.create_table(
        "instrumento_equipamento",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("nr_convenio", sa.String(), nullable=False),
        sa.Column("cnpj_convenente", sa.String(), nullable=False),
        sa.Column("nome_convenente", sa.String(), nullable=False),
        sa.Column("municipio", sa.String(), nullable=True),
        sa.Column("uf", sa.String(length=2), nullable=True),
        sa.Column("cnes", sa.String(), nullable=True),
        sa.Column("equipamento_descricao", sa.String(), nullable=True),
        sa.Column("programa", sa.String(), nullable=True),
        sa.Column("tp_instrumento_programa", sa.String(), nullable=True),
        sa.Column("componente", sa.String(), nullable=True),
        sa.Column("ano_instrumento", sa.Integer(), nullable=True),
        # Sem valor_global/valor_repasse/valor_contrapartida de proposito --
        # ver comentario em app/db/models.py::InstrumentoEquipamento.
        sa.Column("tecnico_titular", sa.String(), nullable=True),
        sa.Column("tecnico_suplente", sa.String(), nullable=True),
        sa.Column("nivel_monitoramento", sa.String(), nullable=True),
        sa.Column("finalidade", sa.String(), nullable=True),
        sa.Column("modalidade_onco", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nr_convenio"),
    )

    op.create_table(
        "evento_marco",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("instrumento_id", sa.BigInteger(), nullable=False),
        sa.Column("marco_id", sa.BigInteger(), nullable=False),
        sa.Column("data_ocorrencia", sa.Date(), nullable=True),
        sa.Column("data_prevista", sa.Date(), nullable=True),
        sa.Column("status_regulatorio", sa.String(), nullable=True),
        sa.Column("observacao", sa.String(), nullable=True),
        sa.Column("autor_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["instrumento_id"], ["instrumento_equipamento.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["marco_id"], ["marco_catalogo.id"]),
        sa.ForeignKeyConstraint(["autor_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_evento_marco_instrumento_marco",
        "evento_marco",
        ["instrumento_id", "marco_id", "created_at"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_evento_marco_instrumento_marco", table_name="evento_marco")
    op.drop_table("evento_marco")
    op.drop_table("instrumento_equipamento")
    op.drop_table("marco_catalogo")
    sa.Enum(name="marco_grupo").drop(op.get_bind(), checkfirst=True)
