"""indices_audit_log

Revision ID: e5fdb376edeb
Revises: b2c3d4e5f6a7
Create Date: 2026-09-28 00:00:00.000000

Módulo de Auditoria (2026-09-28): `audit_log` existe desde o schema inicial
sem nenhum índice além da PK. `GET /auditoria` (novo) faz `ORDER BY
created_at DESC` com filtro opcional por `entity_name`/`user_id` -- tabela
ainda pequena hoje, mas cresce a cada login/CRUD de usuário/edição de
monitoramento a partir de agora; índice evita Seq Scan assim que o volume
passar de trivial. Tabela transacional pequena o bastante pra `CREATE INDEX`
comum (sem `CONCURRENTLY`), diferente do índice trigram sobre 635 mil linhas
de `cnes_estabelecimento`.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5fdb376edeb"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"], unique=False)
    op.create_index("ix_audit_log_entity_name_created_at", "audit_log", ["entity_name", "created_at"], unique=False)
    op.create_index("ix_audit_log_user_id_created_at", "audit_log", ["user_id", "created_at"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_audit_log_user_id_created_at", table_name="audit_log")
    op.drop_index("ix_audit_log_entity_name_created_at", table_name="audit_log")
    op.drop_index("ix_audit_log_created_at", table_name="audit_log")
