"""adiciona tipo_contratacao e contato da execucao em instrumento_equipamento

Revision ID: c7e2a4f81b6d
Revises: b5ce2ad8f332
Create Date: 2026-09-09 20:00:00.000000

Pedido do usuario 2026-09-09 (feedback pos-overview): incluir os 28
registros FAF/TED da planilha que ficaram de fora do import inicial por nao
terem numero de convenio TransfereGov -- precisam de um jeito de marcar
"que tipo de contratacao e esse" (Convenio/FAF/TED), ja que passam a
conviver na mesma tabela com os 105 que sao Convenio de verdade. Tambem
adiciona contato do responsavel tecnico da execucao NA INSTITUICAO
(colunas 42-43 da planilha, opcional -- diferente de tecnico_titular/
suplente, que sao da nossa equipe).

Essa migration tambem corrige dado ja gravado (mesmo espirito da
a9cd77597629): `tecnico_titular`/`tecnico_suplente` tinham casing misto
("Leonardo Barsante" vs "SAMUEL") e 'NA'/'NI' sendo tratados como se
fossem nome de tecnico de verdade (12 instrumentos) -- normaliza pra
UPPER() e vira NULL quando for 'NA'/'NI' (nunca um tecnico "fantasma" na
distribuicao do overview).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7e2a4f81b6d"
down_revision: Union[str, Sequence[str], None] = "b5ce2ad8f332"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("instrumento_equipamento", sa.Column("tipo_contratacao", sa.String(), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("responsavel_execucao_nome", sa.String(), nullable=True))
    op.add_column("instrumento_equipamento", sa.Column("responsavel_execucao_contato", sa.String(), nullable=True))

    # Backfill: todo instrumento ja existente veio do universo Portal/
    # TransfereGov (403 convenios, so "Convênio" na planilha) -- os
    # FAF/TED entram so a partir de agora, via reimport do script.
    op.execute("UPDATE instrumento_equipamento SET tipo_contratacao = 'Convênio' WHERE tipo_contratacao IS NULL")

    # Backfill: normaliza tecnico_titular/tecnico_suplente -- UPPER() em
    # quem tem valor de verdade, NULL em quem for 'NA'/'NI' (nao e nome,
    # e placeholder de "nao informado" que o import antigo nao filtrava).
    for coluna in ("tecnico_titular", "tecnico_suplente"):
        op.execute(f"""
            UPDATE instrumento_equipamento
            SET {coluna} = NULL
            WHERE UPPER(TRIM({coluna})) IN ('NA', 'NI')
        """)
        op.execute(f"""
            UPDATE instrumento_equipamento
            SET {coluna} = UPPER({coluna})
            WHERE {coluna} IS NOT NULL
        """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("instrumento_equipamento", "responsavel_execucao_contato")
    op.drop_column("instrumento_equipamento", "responsavel_execucao_nome")
    op.drop_column("instrumento_equipamento", "tipo_contratacao")
