"""onupdate_explicito_fks_restantes

Revision ID: c9f1a4d7e602
Revises: b8d2c6f4a901
Create Date: 2026-09-16 17:30:00.000000

Torna explicito ON UPDATE RESTRICT nas FKs restantes, sem alterar o ON DELETE
de dominio ja existente.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "c9f1a4d7e602"
down_revision: Union[str, Sequence[str], None] = "b8d2c6f4a901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FKS = [
    ("competency", "fk_competency_published_execution", "fk_competency_published_execution", "execution", ["published_execution_id"], ["id"], "RESTRICT"),
    ("audit_log", "audit_log_user_id_fkey", "fk_audit_log_user", "user", ["user_id"], ["id"], "SET NULL"),
    ("config_decision", "config_decision_confirmed_by_fkey", "fk_config_decision_confirmed_by", "user", ["confirmed_by"], ["id"], "SET NULL"),
    ("reference_file", "reference_file_uploaded_by_fkey", "fk_reference_file_uploaded_by", "user", ["uploaded_by"], ["id"], "SET NULL"),
    ("acao_monitoramento", "acao_monitoramento_instrumento_id_fkey", "fk_acao_monitoramento_instrumento", "instrumento_equipamento", ["instrumento_id"], ["id"], "CASCADE"),
    ("accelerator_row", "accelerator_row_reference_file_id_fkey", "fk_accelerator_row_reference_file", "reference_file", ["reference_file_id"], ["id"], "CASCADE"),
    ("equipment_offer_row", "equipment_offer_row_execution_id_fkey", "fk_equipment_offer_row_execution", "execution", ["execution_id"], ["id"], "CASCADE"),
    ("execution", "execution_executed_by_fkey", "fk_execution_executed_by", "user", ["executed_by"], ["id"], "SET NULL"),
    ("execution", "execution_deleted_by_fkey", "fk_execution_deleted_by", "user", ["deleted_by"], ["id"], "SET NULL"),
    ("execution_alert", "execution_alert_execution_id_fkey", "fk_execution_alert_execution", "execution", ["execution_id"], ["id"], "CASCADE"),
    ("macro_coverage", "macro_coverage_execution_id_fkey", "fk_macro_coverage_execution", "execution", ["execution_id"], ["id"], "CASCADE"),
    ("municipality_coverage", "municipality_coverage_execution_id_fkey", "fk_municipality_coverage_execution", "execution", ["execution_id"], ["id"], "CASCADE"),
    ("municipality_population_row", "municipality_population_row_reference_file_id_fkey", "fk_municipality_population_row_reference_file", "reference_file", ["reference_file_id"], ["id"], "CASCADE"),
    ("proposta_candidata", "proposta_candidata_revisado_por_fkey", "fk_proposta_candidata_revisado_por", "user", ["revisado_por"], ["id"], "SET NULL"),
    ("evento_marco", "evento_marco_instrumento_id_fkey", "fk_evento_marco_instrumento", "instrumento_equipamento", ["instrumento_id"], ["id"], "CASCADE"),
    ("evento_marco", "evento_marco_autor_id_fkey", "fk_evento_marco_autor", "user", ["autor_id"], ["id"], "SET NULL"),
]


def upgrade() -> None:
    for table, old_name, new_name, ref_table, local_cols, remote_cols, ondelete in FKS:
        op.drop_constraint(old_name, table, type_="foreignkey")
        op.create_foreign_key(new_name, table, ref_table, local_cols, remote_cols, ondelete=ondelete, onupdate="RESTRICT")


def downgrade() -> None:
    for table, old_name, new_name, ref_table, local_cols, remote_cols, ondelete in reversed(FKS):
        op.drop_constraint(new_name, table, type_="foreignkey")
        kwargs = {"ondelete": ondelete} if ondelete else {}
        op.create_foreign_key(old_name, table, ref_table, local_cols, remote_cols, **kwargs)
