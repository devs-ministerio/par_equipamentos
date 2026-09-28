"""Impõe formato canônico de CNPJ após backfill auditado.

Revision ID: c3d4e5f6a7b8
Revises: e5fdb376edeb
Create Date: 2026-09-28 10:10:00.000000

Os dados foram normalizados e verificados no Neon antes desta migration.
As constraints são adicionadas como NOT VALID e validadas logo após: novas
escritas ficam protegidas desde a adição, e a validação mantém evidência
explícita de que o legado já respeita o domínio.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "e5fdb376edeb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CONSTRAINTS = (
    ("cnes_estabelecimento", "ck_cnes_estabelecimento_cnpj_formato", "cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'"),
    ("convenio", "ck_convenio_convenente_cnpj_formato", "convenente_cnpj IS NULL OR convenente_cnpj ~ '^[0-9]{14}$'"),
    (
        "instrumento_equipamento",
        "ck_instrumento_equipamento_cnpj_convenente_formato",
        "cnpj_convenente IS NULL OR cnpj_convenente ~ '^[0-9]{14}$'",
    ),
    (
        "pagamento_obra_persus",
        "ck_pagamento_obra_persus_fornecedor_cnpj_formato",
        "fornecedor_cnpj IS NULL OR fornecedor_cnpj ~ '^[0-9]{14}$'",
    ),
    (
        "proposta_candidata",
        "ck_proposta_candidata_cnpj_ente_recebedor_formato",
        "cnpj_ente_recebedor ~ '^[0-9]{14}$'",
    ),
)


def upgrade() -> None:
    for tabela, nome, expressao in CONSTRAINTS:
        op.execute(f"ALTER TABLE {tabela} ADD CONSTRAINT {nome} CHECK ({expressao}) NOT VALID")
        op.execute(f"ALTER TABLE {tabela} VALIDATE CONSTRAINT {nome}")


def downgrade() -> None:
    for tabela, nome, _ in reversed(CONSTRAINTS):
        op.execute(f"ALTER TABLE {tabela} DROP CONSTRAINT IF EXISTS {nome}")
