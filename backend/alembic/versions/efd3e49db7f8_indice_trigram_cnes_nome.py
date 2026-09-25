"""indice_trigram_cnes_nome

Revision ID: efd3e49db7f8
Revises: 5557cabd4a4c
Create Date: 2026-09-17 00:13:28.281621

Bloco 3 do Plan Mode database: `GET /monitoramento/cnes-referencia` (autocomplete
por nome) faz ILIKE '%texto%' sobre 635 mil linhas de cnes_estabelecimento --
medido em ~227ms de Seq Scan no pior caso (sem correspondência). Medido em
banco descartável (par_equipamentos_pytest_loaded, mesmo volume de linhas):
com pg_trgm + GIN, pior caso cai pra ~0,3ms e uma busca comum (~1300
resultados) fica em ~10ms; índice ocupa 39MB (~19% do tamanho da tabela).
Ganho de 2-3 ordens de magnitude justifica o custo de escrita extra numa
tabela de referência com sincronização periódica, não OLTP de escrita
contínua (ver `sincronizar_cnes_referencia*.py`).

`CREATE INDEX CONCURRENTLY` evita lock de tabela inteira nas 635 mil linhas --
por isso roda fora da transação padrão do Alembic (autocommit_block).
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "efd3e49db7f8"
down_revision: Union[str, Sequence[str], None] = "5557cabd4a4c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY idx_cnes_estabelecimento_nome_trgm "
            "ON cnes_estabelecimento USING gin (nome_estabelecimento gin_trgm_ops)"
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_cnes_estabelecimento_nome_trgm")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
