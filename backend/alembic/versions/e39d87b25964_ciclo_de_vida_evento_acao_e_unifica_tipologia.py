"""Ciclo de vida append-only de evento/ação de monitoramento, vínculo fase_geral_id e unificação finalidade->tipologia.

Plan Mode monitoramento-evolucao 2026-09-19: permite editar/excluir
evento/ação preservando o histórico (nunca UPDATE/DELETE físico); amarra
marco de cronograma físico/regulatório à fase geral que ele pertence;
migra `finalidade` para o dicionário fechado de `tipologia` e remove a
coluna antiga; restringe `modalidade_onco` ao dicionário reduzido.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "e39d87b25964"
down_revision = "31a7d8e4c902"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- evento_marco: vínculo de fase + ciclo de vida append-only --
    op.add_column(
        "evento_marco",
        sa.Column(
            "fase_geral_id",
            sa.BigInteger(),
            sa.ForeignKey("marco_catalogo.id", onupdate="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column("evento_marco", sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "evento_marco",
        sa.Column(
            "substituido_por_id",
            sa.BigInteger(),
            sa.ForeignKey("evento_marco.id", ondelete="SET NULL", onupdate="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column("evento_marco", sa.Column("deletado_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "evento_marco",
        sa.Column(
            "deletado_por_id",
            sa.BigInteger(),
            sa.ForeignKey("user.id", ondelete="SET NULL", onupdate="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column("evento_marco", sa.Column("motivo_exclusao", sa.String(), nullable=True))
    op.create_index(
        "idx_evento_marco_ativo",
        "evento_marco",
        ["instrumento_id", "marco_id"],
        postgresql_where=sa.text("substituido_por_id IS NULL AND deletado_em IS NULL"),
    )

    # -- acao_monitoramento: responsável/criador por FK + ciclo de vida --
    op.add_column(
        "acao_monitoramento",
        sa.Column(
            "responsavel_id",
            sa.BigInteger(),
            sa.ForeignKey("user.id", ondelete="SET NULL", onupdate="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "acao_monitoramento",
        sa.Column(
            "criado_por_id",
            sa.BigInteger(),
            sa.ForeignKey("user.id", ondelete="SET NULL", onupdate="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column("acao_monitoramento", sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "acao_monitoramento",
        sa.Column(
            "substituido_por_id",
            sa.BigInteger(),
            sa.ForeignKey("acao_monitoramento.id", ondelete="SET NULL", onupdate="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column("acao_monitoramento", sa.Column("deletado_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "acao_monitoramento",
        sa.Column(
            "deletado_por_id",
            sa.BigInteger(),
            sa.ForeignKey("user.id", ondelete="SET NULL", onupdate="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column("acao_monitoramento", sa.Column("motivo_exclusao", sa.String(), nullable=True))

    # -- instrumento_equipamento: unifica finalidade -> tipologia --
    # Mapeamento pactuado (decisão do usuário, 2026-09-19): não há
    # correspondência automática segura entre os dois vocabulários, então o
    # de-para é fixo e explícito, não inferido.
    op.execute(
        """
        UPDATE instrumento_equipamento
        SET tipologia = CASE finalidade
            WHEN 'Substituição' THEN 'EO'
            WHEN 'Ampliação' THEN 'A'
            WHEN 'Ampliação (cobalto)' THEN 'A'
            ELSE tipologia
        END
        WHERE finalidade IS NOT NULL AND tipologia IS NULL
        """
    )
    op.drop_column("instrumento_equipamento", "finalidade")
    op.create_check_constraint(
        "ck_instrumento_equipamento_modalidade_onco",
        "instrumento_equipamento",
        "modalidade_onco IS NULL OR modalidade_onco IN "
        "('Apoio', 'Diagnóstico', 'Rastreamento', 'Tratamento', 'Múltiplas')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_instrumento_equipamento_modalidade_onco", "instrumento_equipamento", type_="check")
    # Downgrade da coluna é lossy de propósito: o mapeamento finalidade->
    # tipologia não é reversível 1:1 (61+18+2 valores originais colapsaram
    # em só 2 códigos). Restaura a coluna vazia, não o dado histórico.
    op.add_column("instrumento_equipamento", sa.Column("finalidade", sa.String(), nullable=True))

    op.drop_column("acao_monitoramento", "motivo_exclusao")
    op.drop_column("acao_monitoramento", "deletado_por_id")
    op.drop_column("acao_monitoramento", "deletado_em")
    op.drop_column("acao_monitoramento", "substituido_por_id")
    op.drop_column("acao_monitoramento", "atualizado_em")
    op.drop_column("acao_monitoramento", "criado_por_id")
    op.drop_column("acao_monitoramento", "responsavel_id")

    op.drop_index("idx_evento_marco_ativo", table_name="evento_marco")
    op.drop_column("evento_marco", "motivo_exclusao")
    op.drop_column("evento_marco", "deletado_por_id")
    op.drop_column("evento_marco", "deletado_em")
    op.drop_column("evento_marco", "substituido_por_id")
    op.drop_column("evento_marco", "atualizado_em")
    op.drop_column("evento_marco", "fase_geral_id")
