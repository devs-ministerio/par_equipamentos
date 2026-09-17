"""Garantias estruturais da constituição database."""
from __future__ import annotations

from app.db.models import Base


def test_todas_as_fks_declaram_ondelete_e_onupdate():
    faltantes = []
    for tabela in Base.metadata.sorted_tables:
        for coluna in tabela.columns:
            for fk in coluna.foreign_keys:
                if fk.ondelete is None or fk.onupdate is None:
                    faltantes.append((tabela.name, coluna.name, fk.target_fullname, fk.ondelete, fk.onupdate))

    assert faltantes == []


def test_checks_de_nao_negatividade_das_tabelas_de_calculo():
    esperados = {
        "macro_coverage": {
            "ck_macro_coverage_population",
            "ck_macro_coverage_required_qty",
            "ck_macro_coverage_available_qty",
            "ck_macro_coverage_existing_qty",
            "ck_macro_coverage_facility_count",
            "ck_macro_coverage_estimated_need",
        },
        "municipality_coverage": {
            "ck_municipality_coverage_population",
            "ck_municipality_coverage_required_qty",
            "ck_municipality_coverage_available_qty",
            "ck_municipality_coverage_existing_qty",
            "ck_municipality_coverage_facility_count",
            "ck_municipality_coverage_estimated_need",
            "ck_municipality_coverage_distance_km_nearest_equipment",
        },
        "municipality_population_row": {
            "ck_municipality_population_row_resident_population",
            "ck_municipality_population_row_ans_population",
            "ck_municipality_population_row_sus_dependent_population",
        },
    }

    for tabela, checks in esperados.items():
        existentes = {c.name for c in Base.metadata.tables[tabela].constraints if getattr(c, "name", None)}
        assert checks <= existentes
