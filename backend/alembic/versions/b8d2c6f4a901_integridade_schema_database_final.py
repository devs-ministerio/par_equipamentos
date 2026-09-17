"""integridade_schema_database_final

Revision ID: b8d2c6f4a901
Revises: a7c4e1f9b203
Create Date: 2026-09-16 17:20:00.000000

Fecha o bloco database: explicita ON DELETE/ON UPDATE em FKs antigas e
promove invariantes numericas para CHECKs fisicos.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "b8d2c6f4a901"
down_revision: Union[str, Sequence[str], None] = "a7c4e1f9b203"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("execution_competency_id_fkey", "execution", type_="foreignkey")
    op.drop_constraint("execution_accelerator_file_id_fkey", "execution", type_="foreignkey")
    op.drop_constraint("execution_population_file_id_fkey", "execution", type_="foreignkey")
    op.drop_constraint("evento_marco_marco_id_fkey", "evento_marco", type_="foreignkey")

    op.create_foreign_key(
        "fk_execution_competency",
        "execution",
        "competency",
        ["competency_id"],
        ["id"],
        ondelete="RESTRICT",
        onupdate="RESTRICT",
    )
    op.create_foreign_key(
        "fk_execution_accelerator_file",
        "execution",
        "reference_file",
        ["accelerator_file_id"],
        ["id"],
        ondelete="SET NULL",
        onupdate="RESTRICT",
    )
    op.create_foreign_key(
        "fk_execution_population_file",
        "execution",
        "reference_file",
        ["population_file_id"],
        ["id"],
        ondelete="SET NULL",
        onupdate="RESTRICT",
    )
    op.create_foreign_key(
        "fk_evento_marco_marco_catalogo",
        "evento_marco",
        "marco_catalogo",
        ["marco_id"],
        ["id"],
        ondelete="RESTRICT",
        onupdate="RESTRICT",
    )

    op.create_check_constraint("ck_municipality_population_row_resident_population", "municipality_population_row", "resident_population >= 0")
    op.create_check_constraint("ck_municipality_population_row_ans_population", "municipality_population_row", "ans_population >= 0")
    op.create_check_constraint("ck_municipality_population_row_sus_dependent_population", "municipality_population_row", "sus_dependent_population >= 0")
    op.create_check_constraint("ck_inca_estimate_estimated_cases", "inca_estimate", "estimated_cases >= 0")
    op.create_check_constraint("ck_accelerator_row_operational_qty", "accelerator_row", "operational_qty >= 0")
    op.create_check_constraint("ck_macro_coverage_population", "macro_coverage", "population IS NULL OR population >= 0")
    op.create_check_constraint("ck_macro_coverage_population_residente", "macro_coverage", "population_residente IS NULL OR population_residente >= 0")
    op.create_check_constraint("ck_macro_coverage_population_ans", "macro_coverage", "population_ans IS NULL OR population_ans >= 0")
    op.create_check_constraint("ck_macro_coverage_required_qty", "macro_coverage", "required_qty IS NULL OR required_qty >= 0")
    op.create_check_constraint("ck_macro_coverage_available_qty", "macro_coverage", "available_qty IS NULL OR available_qty >= 0")
    op.create_check_constraint("ck_macro_coverage_existing_qty", "macro_coverage", "existing_qty IS NULL OR existing_qty >= 0")
    op.create_check_constraint("ck_macro_coverage_facility_count", "macro_coverage", "facility_count IS NULL OR facility_count >= 0")
    op.create_check_constraint("ck_macro_coverage_estimated_need", "macro_coverage", "estimated_need IS NULL OR estimated_need >= 0")
    op.create_check_constraint("ck_municipality_coverage_population", "municipality_coverage", "population IS NULL OR population >= 0")
    op.create_check_constraint("ck_municipality_coverage_population_residente", "municipality_coverage", "population_residente IS NULL OR population_residente >= 0")
    op.create_check_constraint("ck_municipality_coverage_population_ans", "municipality_coverage", "population_ans IS NULL OR population_ans >= 0")
    op.create_check_constraint("ck_municipality_coverage_required_qty", "municipality_coverage", "required_qty IS NULL OR required_qty >= 0")
    op.create_check_constraint("ck_municipality_coverage_available_qty", "municipality_coverage", "available_qty IS NULL OR available_qty >= 0")
    op.create_check_constraint("ck_municipality_coverage_existing_qty", "municipality_coverage", "existing_qty IS NULL OR existing_qty >= 0")
    op.create_check_constraint("ck_municipality_coverage_facility_count", "municipality_coverage", "facility_count IS NULL OR facility_count >= 0")
    op.create_check_constraint("ck_municipality_coverage_estimated_need", "municipality_coverage", "estimated_need IS NULL OR estimated_need >= 0")
    op.create_check_constraint("ck_municipality_coverage_distance_km_nearest_equipment", "municipality_coverage", "distance_km_nearest_equipment IS NULL OR distance_km_nearest_equipment >= 0")
    op.create_check_constraint("ck_municipality_coverage_distance_km_nearest_radiopharma", "municipality_coverage", "distance_km_nearest_radiopharma IS NULL OR distance_km_nearest_radiopharma >= 0")
    op.create_check_constraint("ck_municipality_coverage_hours_road_nearest_radiopharma", "municipality_coverage", "hours_road_nearest_radiopharma IS NULL OR hours_road_nearest_radiopharma >= 0")
    op.create_check_constraint("ck_municipality_coverage_hours_air_nearest_radiopharma", "municipality_coverage", "hours_air_nearest_radiopharma IS NULL OR hours_air_nearest_radiopharma >= 0")
    op.create_check_constraint("ck_marco_catalogo_ordem", "marco_catalogo", "ordem IS NULL OR ordem >= 0")
    op.create_check_constraint("ck_marco_catalogo_execucao_pct", "marco_catalogo", "execucao_fisica_pct_referencia IS NULL OR (execucao_fisica_pct_referencia >= 0 AND execucao_fisica_pct_referencia <= 1)")
    op.create_check_constraint("ck_instrumento_equipamento_vida_util", "instrumento_equipamento", "equipamento_vida_util_anos IS NULL OR equipamento_vida_util_anos >= 0")


def downgrade() -> None:
    for table, names in (
        ("instrumento_equipamento", ["ck_instrumento_equipamento_vida_util"]),
        ("marco_catalogo", ["ck_marco_catalogo_execucao_pct", "ck_marco_catalogo_ordem"]),
        ("municipality_coverage", [
            "ck_municipality_coverage_hours_air_nearest_radiopharma",
            "ck_municipality_coverage_hours_road_nearest_radiopharma",
            "ck_municipality_coverage_distance_km_nearest_radiopharma",
            "ck_municipality_coverage_distance_km_nearest_equipment",
            "ck_municipality_coverage_estimated_need",
            "ck_municipality_coverage_facility_count",
            "ck_municipality_coverage_existing_qty",
            "ck_municipality_coverage_available_qty",
            "ck_municipality_coverage_required_qty",
            "ck_municipality_coverage_population_ans",
            "ck_municipality_coverage_population_residente",
            "ck_municipality_coverage_population",
        ]),
        ("macro_coverage", [
            "ck_macro_coverage_estimated_need",
            "ck_macro_coverage_facility_count",
            "ck_macro_coverage_existing_qty",
            "ck_macro_coverage_available_qty",
            "ck_macro_coverage_required_qty",
            "ck_macro_coverage_population_ans",
            "ck_macro_coverage_population_residente",
            "ck_macro_coverage_population",
        ]),
        ("accelerator_row", ["ck_accelerator_row_operational_qty"]),
        ("inca_estimate", ["ck_inca_estimate_estimated_cases"]),
        ("municipality_population_row", [
            "ck_municipality_population_row_sus_dependent_population",
            "ck_municipality_population_row_ans_population",
            "ck_municipality_population_row_resident_population",
        ]),
    ):
        for name in names:
            op.drop_constraint(name, table, type_="check")

    op.drop_constraint("fk_evento_marco_marco_catalogo", "evento_marco", type_="foreignkey")
    op.drop_constraint("fk_execution_population_file", "execution", type_="foreignkey")
    op.drop_constraint("fk_execution_accelerator_file", "execution", type_="foreignkey")
    op.drop_constraint("fk_execution_competency", "execution", type_="foreignkey")

    op.create_foreign_key("evento_marco_marco_id_fkey", "evento_marco", "marco_catalogo", ["marco_id"], ["id"])
    op.create_foreign_key("execution_population_file_id_fkey", "execution", "reference_file", ["population_file_id"], ["id"])
    op.create_foreign_key("execution_accelerator_file_id_fkey", "execution", "reference_file", ["accelerator_file_id"], ["id"])
    op.create_foreign_key("execution_competency_id_fkey", "execution", "competency", ["competency_id"], ["id"])
