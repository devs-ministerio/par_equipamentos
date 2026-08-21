"""Cobre os dois endpoints novos de granularidade fina da Cobertura
Assistencial (decisao 2026-08-21): /municipality-coverage (uma linha por
municipio) e /health-region-coverage (agregado por regiao de saude,
computado em tempo de leitura). Roda contra o banco configurado, como os
outros testes de endpoint (sem camada de repositorio pra mockar) -- pula
sozinho se nao houver dado carregado.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Competency, Execution, MunicipalityCoverage
from app.main import app

client = TestClient(app)


def _exec_id_tomografo(db):
    """Execucao TOMOGRAFO mais recente -- NAO a execucao mais recente global
    (bug real corrigido em 2026-08-21: com RESSONANCIA tambem no banco e mais
    recente que o seed de TOMOGRAFO, pegar so "a ultima execucao" sem
    escopar por familia resolvia pra RESSONANCIA, o helper `_tem_dado()`
    dava False e o pytest pulava o arquivo inteiro em silencio em vez de
    falhar -- mascarou a mesma regressao nos routers)."""
    return db.execute(
        select(Execution.id)
        .join(Competency, Execution.competency_id == Competency.id)
        .where(Competency.equipment_family == "TOMOGRAFO")
        .order_by(Execution.started_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def _tem_dado() -> bool:
    db = SessionLocal()
    try:
        exec_id = _exec_id_tomografo(db)
        if exec_id is None:
            return False
        return (
            db.execute(
                select(MunicipalityCoverage.id)
                .where(MunicipalityCoverage.execution_id == exec_id, MunicipalityCoverage.equipment_family == "TOMOGRAFO")
                .limit(1)
            ).scalar_one_or_none()
            is not None
        )
    finally:
        db.close()


pytestmark = pytest.mark.skipif(not _tem_dado(), reason="banco sem municipality_coverage carregada")


def _primeiro_macro_com_mais_de_uma_regiao_de_saude() -> str:
    """Acha um macro_code com >=2 regioes de saude distintas -- pra testar a
    agregacao do /health-region-coverage com um caso nao-trivial."""
    db = SessionLocal()
    try:
        exec_id = _exec_id_tomografo(db)
        rows = db.execute(
            select(MunicipalityCoverage.macro_code, MunicipalityCoverage.health_region_code).where(
                MunicipalityCoverage.execution_id == exec_id,
                MunicipalityCoverage.equipment_family == "TOMOGRAFO",
                MunicipalityCoverage.macro_code.is_not(None),
            )
        ).all()
        por_macro: dict[str, set[str]] = {}
        for macro_code, regiao in rows:
            por_macro.setdefault(macro_code, set()).add(regiao)
        macro_code = next(m for m, regioes in por_macro.items() if len(regioes) >= 2)
        return macro_code
    finally:
        db.close()


def test_municipality_coverage_sem_filtro_devolve_todos_os_municipios_do_pais():
    rows = client.get("/municipality-coverage", params={"equipment_family": "TOMOGRAFO"}).json()
    assert len(rows) >= 5000  # ~5570 municipios brasileiros


def test_min_population_filtra_municipios_pequenos():
    todos = client.get("/municipality-coverage", params={"equipment_family": "TOMOGRAFO"}).json()
    filtrados = client.get(
        "/municipality-coverage", params={"equipment_family": "TOMOGRAFO", "min_population": 100_000}
    ).json()
    assert len(filtrados) < len(todos)
    assert all(m["population"] >= 100_000 for m in filtrados)


def test_health_region_coverage_agrega_population_dos_municipios():
    macro_code = _primeiro_macro_com_mais_de_uma_regiao_de_saude()

    municipios = client.get(
        "/municipality-coverage", params={"equipment_family": "TOMOGRAFO", "macro_code": macro_code}
    ).json()
    regioes = client.get(
        "/health-region-coverage", params={"equipment_family": "TOMOGRAFO", "macro_code": macro_code}
    ).json()

    assert len(regioes) >= 2

    for regiao in regioes:
        municipios_da_regiao = [m for m in municipios if m["health_region_code"] == regiao["health_region_code"]]
        assert regiao["population"] == sum(m["population"] for m in municipios_da_regiao)
        assert regiao["existing_qty"] == sum(m["existing_qty"] for m in municipios_da_regiao)
        assert regiao["available_qty"] == sum(m["available_qty"] for m in municipios_da_regiao)


def test_health_region_required_qty_nao_e_soma_dos_ceils_dos_municipios():
    """RN: required_qty da regiao = ceil(populacao SOMADA / 100_000), nunca
    a soma dos required_qty individuais dos municipios -- senao um bolsao de
    varias cidades pequenas (cada uma < 100 mil, cada uma arredondando pra
    'precisa de 1') superestimaria a demanda da regiao."""
    macro_code = _primeiro_macro_com_mais_de_uma_regiao_de_saude()
    regioes = client.get(
        "/health-region-coverage", params={"equipment_family": "TOMOGRAFO", "macro_code": macro_code}
    ).json()
    import math

    for regiao in regioes:
        esperado = math.ceil(regiao["population"] / 100_000) if regiao["population"] else 0
        assert regiao["required_qty"] == esperado
