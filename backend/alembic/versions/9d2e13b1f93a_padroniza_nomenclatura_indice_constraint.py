"""padroniza_nomenclatura_indice_constraint

Revision ID: 9d2e13b1f93a
Revises: c9f1a4d7e602
Create Date: 2026-09-17 00:00:00.000000

Item 2 do Plan Mode database 2026-09-16
(docs/arquitetura/planmode-database-2026-09-16.md): Secao 3 da constituicao
database define idx_<tabela>_<coluna(s)>/uq_<tabela>_<coluna(s)>. Havia 3
prefixos de indice coexistindo (idx_/ix_/ux_) e 5 UNIQUE sem nome explicito
(autogerado pelo Postgres). So RENAME de metadata (ALTER INDEX/ALTER TABLE
RENAME CONSTRAINT) -- sem DROP/recriacao de dado, sem reescrita de tabela.
Nomes autogerados abaixo confirmados via pg_constraint contra banco real
antes de escrever esta migration (nao assumidos pela convencao
<tabela>_<coluna>_key sem checar).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "9d2e13b1f93a"
down_revision: Union[str, Sequence[str], None] = "c9f1a4d7e602"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDICES = [
    ("ix_macro_coverage_execution_family", "idx_macro_coverage_execution_family"),
    ("ix_municipality_coverage_execution_family", "idx_municipality_coverage_execution_family"),
    ("ix_municipality_coverage_execution_health_region", "idx_municipality_coverage_execution_health_region"),
    ("ix_municipality_coverage_execution_macro", "idx_municipality_coverage_execution_macro"),
    ("ix_eor_execution_family", "idx_equipment_offer_row_execution_family"),
    ("ix_eor_execution_family_state", "idx_equipment_offer_row_execution_family_state"),
    ("ix_eor_execution_macro", "idx_equipment_offer_row_execution_macro"),
    ("ix_eor_execution_health_region", "idx_equipment_offer_row_execution_health_region"),
    ("ix_eor_execution_municipality", "idx_equipment_offer_row_execution_municipality"),
    ("ix_eor_execution_cnes", "idx_equipment_offer_row_execution_cnes"),
    ("ix_evento_marco_instrumento_marco", "idx_evento_marco_instrumento_marco"),
    ("ix_acao_monitoramento_instrumento", "idx_acao_monitoramento_instrumento"),
    ("ix_notificacao_lida_created", "idx_notificacao_lida_created"),
    ("ux_config_decision_key_vigente", "uq_config_decision_key_vigente"),
]

UNIQUE_CONSTRAINTS = [
    ("user", "user_email_key", "uq_user_email"),
    ("convenio", "convenio_numero_key", "uq_convenio_numero"),
    ("marco_catalogo", "marco_catalogo_codigo_key", "uq_marco_catalogo_codigo"),
    ("instrumento_equipamento", "instrumento_equipamento_nr_convenio_key", "uq_instrumento_equipamento_nr_convenio"),
    ("proposta_candidata", "proposta_candidata_id_proposta_key", "uq_proposta_candidata_id_proposta"),
]


def upgrade() -> None:
    for old, new in INDICES:
        op.execute(f'ALTER INDEX "{old}" RENAME TO "{new}"')
    for table, old, new in UNIQUE_CONSTRAINTS:
        op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{old}" TO "{new}"')


def downgrade() -> None:
    for table, old, new in UNIQUE_CONSTRAINTS:
        op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{new}" TO "{old}"')
    for old, new in INDICES:
        op.execute(f'ALTER INDEX "{new}" RENAME TO "{old}"')
