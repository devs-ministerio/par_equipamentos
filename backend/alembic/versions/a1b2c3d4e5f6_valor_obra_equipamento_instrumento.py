"""Adiciona valor_obra e valor_equipamento em instrumento_equipamento.

Achado ao vivo 2026-09-27 (usuário: "acredito que temos valores para obra,
reforma e equipamento" na ingestão manual do PERSUS): a aba "Obras" de
`data/Controle PERSUS.xlsx` publica "R$ Projeto + reajuste" (obra/reforma) e
"R$ Equipamento" separados, mas só o TOTAL (`investimento_aquisicao`) era
gravado -- o split nunca tinha sido lido por
`scripts/complementar_persus_monitoramento.py`.

DDL aplicado manualmente fora desta migration (2026-09-27) via
`DATABASE_URL_MIGRATION` direto -- `alembic upgrade head` está bloqueado 2
revisões atrás (`488a535a0b5e`, `ALTER TYPE notificacao_tipo ADD VALUE`
falha com `InsufficientPrivilege pro role de migration, achado antes deste
bloco, sem relação com esta mudança). `IF NOT EXISTS` deixa este arquivo
seguro pra rodar de novo quando a cadeia for destravada.

Revision ID: a1b2c3d4e5f6
Revises: 9c2e4f7a1d38
Create Date: 2026-09-27 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "9c2e4f7a1d38"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE instrumento_equipamento ADD COLUMN IF NOT EXISTS valor_obra NUMERIC(16, 2)")
    op.execute("ALTER TABLE instrumento_equipamento ADD COLUMN IF NOT EXISTS valor_equipamento NUMERIC(16, 2)")


def downgrade() -> None:
    op.execute("ALTER TABLE instrumento_equipamento DROP COLUMN IF EXISTS valor_equipamento")
    op.execute("ALTER TABLE instrumento_equipamento DROP COLUMN IF EXISTS valor_obra")
