"""Regressao do bug de granularidade corrigido em 2026-08-21: os cards do
Dashboard somavam macro_coverage (agregado so por macro) e mostravam o
total da macro inteira mesmo filtrando por um municipio/regiao de
saude/CNES so. GET /equipment-offer-rows/totals soma direto de
equipment_offer_row, na granularidade real do filtro pedido.

Roda contra o banco configurado em DATABASE_URL (mesmo padrao dos outros
routers, que nao tem camada de repositorio pra mockar) -- pula sozinho se
o banco nao tiver nenhuma execucao carregada (ex.: banco novo, sem rodar
scripts/run_pipeline_tomografo.py ou seed_tomografo.py ainda).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import EquipmentOfferRow, Execution
from app.main import app

client = TestClient(app)


def _tem_dado_tomografo() -> bool:
    db = SessionLocal()
    try:
        exec_id = db.execute(select(Execution.id).order_by(Execution.started_at.desc()).limit(1)).scalar_one_or_none()
        if exec_id is None:
            return False
        tem_linha = db.execute(
            select(EquipmentOfferRow.id)
            .where(EquipmentOfferRow.execution_id == exec_id, EquipmentOfferRow.equipment_family == "TOMOGRAFO")
            .limit(1)
        ).scalar_one_or_none()
        return tem_linha is not None
    finally:
        db.close()


pytestmark = pytest.mark.skipif(
    not _tem_dado_tomografo(), reason="banco sem execucao TOMOGRAFO carregada (rode o pipeline/seed primeiro)"
)


def _totais(**params):
    r = client.get("/equipment-offer-rows/totals", params={"equipment_family": "TOMOGRAFO", **params})
    assert r.status_code == 200
    return r.json()


def _primeiro_municipio_com_oferta() -> tuple[str, str, str]:
    """Acha (municipio, uf, macro_code) de algum estabelecimento real, pra
    nao depender de nome de cidade hardcoded (o seed de teste pode nao ter
    Anapolis, por exemplo)."""
    db = SessionLocal()
    try:
        exec_id = db.execute(select(Execution.id).order_by(Execution.started_at.desc()).limit(1)).scalar_one()
        row = db.execute(
            select(EquipmentOfferRow.municipality_name, EquipmentOfferRow.state, EquipmentOfferRow.macro_code)
            .where(
                EquipmentOfferRow.execution_id == exec_id,
                EquipmentOfferRow.equipment_family == "TOMOGRAFO",
                EquipmentOfferRow.municipality_name.is_not(None),
                EquipmentOfferRow.macro_code.is_not(None),
            )
            .limit(1)
        ).first()
        assert row is not None
        return row
    finally:
        db.close()


def test_sem_filtro_bate_com_soma_de_macro_coverage():
    coverage = client.get("/macro-coverage", params={"equipment_family": "TOMOGRAFO"}).json()
    soma_existing = sum(r["existing_qty"] or 0 for r in coverage)
    soma_available = sum(r["available_qty"] or 0 for r in coverage)

    totais = _totais()
    assert totais["existing_qty"] == soma_existing
    assert totais["available_qty"] == soma_available


def test_filtro_por_municipio_e_mais_fino_que_por_macro():
    municipio, uf, macro_code = _primeiro_municipio_com_oferta()

    totais_macro = _totais(macro_code=macro_code)
    totais_municipio = _totais(municipality=f"{municipio}|{uf}")

    # o municipio e um subconjunto da macro -- nunca pode ter mais
    # equipamento que a macro inteira (essa era exatamente a inversao do
    # bug: antes o filtro de municipio "vazava" pro total da macro).
    assert totais_municipio["existing_qty"] <= totais_macro["existing_qty"]
    assert totais_municipio["available_qty"] <= totais_macro["available_qty"]


def test_available_qty_nunca_maior_que_existing_qty():
    # available_qty e o subconjunto SUS de existing_qty (D-02) -- nunca pode
    # inverter, em nenhuma granularidade de filtro.
    totais = _totais()
    assert totais["available_qty"] <= totais["existing_qty"]
