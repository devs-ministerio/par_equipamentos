"""Audita dados antes de promover relacoes da aplicacao para FK/CHECK.

Uso:

    TEST_DATABASE_URL=postgresql+psycopg://... python -m scripts.auditar_integridade_database

O script e somente leitura. Ele existe para o bloco database da constituicao:
antes de criar FKs/checks em migrations, medimos orfaos e invariantes basicas
num PostgreSQL dedicado de teste.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class IntegrityCheck:
    name: str
    description: str
    count_sql: str
    sample_sql: str


CHECKS: tuple[IntegrityCheck, ...] = (
    IntegrityCheck(
        name="convenio_cnes_orfao",
        description="convenio.cnes sem linha correspondente em cnes_estabelecimento",
        count_sql="""
            SELECT count(*)
            FROM convenio c
            WHERE c.cnes IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM cnes_estabelecimento ce WHERE ce.cnes = c.cnes
              )
        """,
        sample_sql="""
            SELECT c.numero, c.cnes
            FROM convenio c
            WHERE c.cnes IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM cnes_estabelecimento ce WHERE ce.cnes = c.cnes
              )
            ORDER BY c.numero
            LIMIT 10
        """,
    ),
    IntegrityCheck(
        name="instrumento_cnes_orfao",
        description="instrumento_equipamento.cnes sem linha correspondente em cnes_estabelecimento",
        count_sql="""
            SELECT count(*)
            FROM instrumento_equipamento i
            WHERE i.cnes IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM cnes_estabelecimento ce WHERE ce.cnes = i.cnes
              )
        """,
        sample_sql="""
            SELECT i.nr_convenio, i.cnes
            FROM instrumento_equipamento i
            WHERE i.cnes IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM cnes_estabelecimento ce WHERE ce.cnes = i.cnes
              )
            ORDER BY i.nr_convenio
            LIMIT 10
        """,
    ),
    IntegrityCheck(
        name="proposta_cnes_orfao",
        description="proposta_candidata.cnes sem linha correspondente em cnes_estabelecimento",
        count_sql="""
            SELECT count(*)
            FROM proposta_candidata p
            WHERE p.cnes IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM cnes_estabelecimento ce WHERE ce.cnes = p.cnes
              )
        """,
        sample_sql="""
            SELECT p.id, p.id_proposta, p.cnes
            FROM proposta_candidata p
            WHERE p.cnes IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM cnes_estabelecimento ce WHERE ce.cnes = p.cnes
              )
            ORDER BY p.id
            LIMIT 10
        """,
    ),
    IntegrityCheck(
        name="proposta_legada_aceita_sem_instrumento",
        description="registro legado de proposta aceita sem instrumento no identificador esperado",
        count_sql="""
            SELECT count(*)
            FROM proposta_candidata p
            WHERE p.status = 'aceita'
              AND NOT EXISTS (
                SELECT 1
                FROM instrumento_equipamento i
                WHERE i.nr_convenio = COALESCE(NULLIF(trim(p.cd_parceria), ''), p.id_proposta::text)
              )
        """,
        sample_sql="""
            SELECT p.id, p.id_proposta, p.cd_parceria,
                   COALESCE(NULLIF(trim(p.cd_parceria), ''), p.id_proposta::text) AS nr_convenio_esperado
            FROM proposta_candidata p
            WHERE p.status = 'aceita'
              AND NOT EXISTS (
                SELECT 1
                FROM instrumento_equipamento i
                WHERE i.nr_convenio = COALESCE(NULLIF(trim(p.cd_parceria), ''), p.id_proposta::text)
              )
            ORDER BY p.id
            LIMIT 10
        """,
    ),
    IntegrityCheck(
        name="instrumento_transferegov_sem_proposta_correspondente",
        description="instrumento Parceria TransfereGov sem proposta correspondente",
        count_sql="""
            SELECT count(*)
            FROM instrumento_equipamento i
            WHERE i.tipo_contratacao = 'Parceria TransfereGov'
              AND NOT EXISTS (
                SELECT 1
                FROM proposta_candidata p
                WHERE (
                    i.nr_convenio = p.cd_parceria
                    OR i.nr_convenio = p.id_proposta::text
                  )
              )
        """,
        sample_sql="""
            SELECT i.id, i.nr_convenio, i.nome_convenente
            FROM instrumento_equipamento i
            WHERE i.tipo_contratacao = 'Parceria TransfereGov'
              AND NOT EXISTS (
                SELECT 1
                FROM proposta_candidata p
                WHERE (
                    i.nr_convenio = p.cd_parceria
                    OR i.nr_convenio = p.id_proposta::text
                  )
              )
            ORDER BY i.id
            LIMIT 10
        """,
    ),
    IntegrityCheck(
        name="cnes_codigo_invalido",
        description="codigos CNES preenchidos fora do formato de 7 digitos",
        count_sql="""
            SELECT count(*) FROM (
                SELECT cnes FROM cnes_estabelecimento WHERE cnes !~ '^[0-9]{7}$'
                UNION ALL
                SELECT cnes FROM convenio WHERE cnes IS NOT NULL AND cnes !~ '^[0-9]{7}$'
                UNION ALL
                SELECT cnes FROM instrumento_equipamento WHERE cnes IS NOT NULL AND cnes !~ '^[0-9]{7}$'
                UNION ALL
                SELECT cnes FROM proposta_candidata WHERE cnes IS NOT NULL AND cnes !~ '^[0-9]{7}$'
            ) invalidos
        """,
        sample_sql="""
            SELECT origem, cnes FROM (
                SELECT 'cnes_estabelecimento' AS origem, cnes FROM cnes_estabelecimento WHERE cnes !~ '^[0-9]{7}$'
                UNION ALL
                SELECT 'convenio' AS origem, cnes FROM convenio WHERE cnes IS NOT NULL AND cnes !~ '^[0-9]{7}$'
                UNION ALL
                SELECT 'instrumento_equipamento' AS origem, cnes FROM instrumento_equipamento WHERE cnes IS NOT NULL AND cnes !~ '^[0-9]{7}$'
                UNION ALL
                SELECT 'proposta_candidata' AS origem, cnes FROM proposta_candidata WHERE cnes IS NOT NULL AND cnes !~ '^[0-9]{7}$'
            ) invalidos
            ORDER BY origem, cnes
            LIMIT 10
        """,
    ),
    IntegrityCheck(
        name="coordenada_invalida",
        description="latitude/longitude fora do intervalo geografico permitido",
        count_sql="""
            SELECT count(*) FROM (
                SELECT cnes AS chave
                FROM cnes_estabelecimento
                WHERE (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
                   OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))
                UNION ALL
                SELECT cnes_code AS chave
                FROM equipment_offer_row
                WHERE (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
                   OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))
            ) invalidas
        """,
        sample_sql="""
            SELECT origem, chave, latitude, longitude FROM (
                SELECT 'cnes_estabelecimento' AS origem, cnes AS chave, latitude, longitude
                FROM cnes_estabelecimento
                WHERE (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
                   OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))
                UNION ALL
                SELECT 'equipment_offer_row' AS origem, cnes_code AS chave, latitude, longitude
                FROM equipment_offer_row
                WHERE (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
                   OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))
            ) invalidas
            ORDER BY origem, chave
            LIMIT 10
        """,
    ),
    IntegrityCheck(
        name="contagem_negativa",
        description="populacao, demanda ou quantidade negativa onde o dominio nao permite",
        count_sql="""
            SELECT count(*) FROM (
                SELECT id FROM macro_coverage
                WHERE population < 0 OR population_residente < 0 OR population_ans < 0
                   OR required_qty < 0 OR available_qty < 0 OR existing_qty < 0 OR facility_count < 0
                UNION ALL
                SELECT id FROM municipality_coverage
                WHERE population < 0 OR population_residente < 0 OR population_ans < 0
                   OR required_qty < 0 OR available_qty < 0 OR existing_qty < 0 OR facility_count < 0
                UNION ALL
                SELECT id FROM equipment_offer_row
                WHERE existing_qty < 0 OR in_use_qty < 0
                UNION ALL
                SELECT id FROM municipality_population_row
                WHERE resident_population < 0 OR ans_population < 0 OR sus_dependent_population < 0
            ) invalidas
        """,
        sample_sql="""
            SELECT origem, id FROM (
                SELECT 'macro_coverage' AS origem, id FROM macro_coverage
                WHERE population < 0 OR population_residente < 0 OR population_ans < 0
                   OR required_qty < 0 OR available_qty < 0 OR existing_qty < 0 OR facility_count < 0
                UNION ALL
                SELECT 'municipality_coverage' AS origem, id FROM municipality_coverage
                WHERE population < 0 OR population_residente < 0 OR population_ans < 0
                   OR required_qty < 0 OR available_qty < 0 OR existing_qty < 0 OR facility_count < 0
                UNION ALL
                SELECT 'equipment_offer_row' AS origem, id FROM equipment_offer_row
                WHERE existing_qty < 0 OR in_use_qty < 0
                UNION ALL
                SELECT 'municipality_population_row' AS origem, id FROM municipality_population_row
                WHERE resident_population < 0 OR ans_population < 0 OR sus_dependent_population < 0
            ) invalidas
            ORDER BY origem, id
            LIMIT 10
        """,
    ),
)


def _configure_database_url() -> None:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise SystemExit("Defina TEST_DATABASE_URL para auditar um PostgreSQL dedicado de teste.")

    parsed = make_url(url)
    if parsed.get_backend_name() != "postgresql":
        raise SystemExit("TEST_DATABASE_URL precisa usar PostgreSQL.")

    database = (parsed.database or "").lower()
    if "test" not in database and "pytest" not in database:
        raise SystemExit("TEST_DATABASE_URL precisa conter 'test' ou 'pytest' no nome do banco.")

    os.environ["DATABASE_URL"] = url


def _rows_as_dicts(rows: Sequence[Any]) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in rows]


def run_checks(db: Session) -> list[tuple[IntegrityCheck, int, list[dict[str, Any]]]]:
    results = []
    for check in CHECKS:
        count = db.execute(text(check.count_sql)).scalar_one()
        samples = _rows_as_dicts(db.execute(text(check.sample_sql)).fetchall()) if count else []
        results.append((check, int(count), samples))
    return results


def run() -> int:
    _configure_database_url()

    from app.db.base import SessionLocal

    db = SessionLocal()
    try:
        results = run_checks(db)
    finally:
        db.close()

    failures = [(check, count, samples) for check, count, samples in results if count > 0]

    for check, count, samples in results:
        status = "OK" if count == 0 else "FALHA"
        print(f"[{status}] {check.name}: {count} -- {check.description}")
        for sample in samples:
            print(f"  exemplo: {sample}")

    if failures:
        print(f"\n{len(failures)} checagem(ns) falharam. Corrija/backfill antes de criar FK/CHECK.")
        return 1

    print("\nTodas as checagens passaram. Dados prontos para a proxima migration de integridade.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
