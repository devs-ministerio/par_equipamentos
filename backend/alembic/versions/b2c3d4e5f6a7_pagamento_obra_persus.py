"""Cria pagamento_obra_persus.

Achado ao vivo 2026-09-27 (usuário, auditoria da ingestão manual do PERSUS):
a aba "Pagamentos" de `data/Controle PERSUS.xlsx` tem 111 pagamentos de obra
(empreiteira/construtora) por código da obra ("Cod.") -- 110 batem 1:1 com
um instrumento monitorado já existente. Nunca tinha sido lida por nenhum
script (`scripts/complementar_persus_monitoramento.py` só abre "Obras",
"Equipamentos" e "Inauguração").

DDL aplicado manualmente fora desta migration (2026-09-27) via
`DATABASE_URL_MIGRATION` direto -- `alembic upgrade head` segue bloqueado 2
revisões atrás (`488a535a0b5e`, `ALTER TYPE notificacao_tipo ADD VALUE`
falha com `InsufficientPrivilege`, achado antes deste bloco, sem relação
com esta mudança). `IF NOT EXISTS` deixa este arquivo seguro pra rodar de
novo quando a cadeia for destravada.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-27 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS pagamento_obra_persus (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            instrumento_id BIGINT NOT NULL REFERENCES instrumento_equipamento(id) ON DELETE CASCADE ON UPDATE RESTRICT,
            tipo VARCHAR NOT NULL DEFAULT 'obra',
            codigo_obra VARCHAR,
            nup_pagamento VARCHAR,
            fornecedor_nome VARCHAR,
            fornecedor_cnpj VARCHAR,
            data_nota_fiscal DATE,
            data_pagamento DATE,
            valor NUMERIC(16,2),
            origem_dado VARCHAR,
            chave_origem VARCHAR NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_pagamento_obra_persus_chave_origem UNIQUE (chave_origem),
            CONSTRAINT ck_pagamento_obra_persus_tipo CHECK (tipo IN ('obra', 'fiscalizacao'))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pagamento_obra_persus_instrumento "
        "ON pagamento_obra_persus (instrumento_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS pagamento_obra_persus")
