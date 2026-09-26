"""app/repositories/{cobertura_relatorio,convenios,execucoes}.py e o filtro
novo de app/repositories/monitoramento.py::listar_instrumentos -- extração
mínima pro relatório (Plan Mode docs/arquitetura/
planmode-relatorios-2026-09-25.md, Bloco 2). Usa o dado sintético já
semeado por `tests/fixtures_cobertura.py`/`scripts/seed_monitoramento.py`
(rodado em `pytest_sessionstart`, ver conftest.py)."""

from __future__ import annotations

import pytest

from app.db.base import SessionLocal
from app.repositories import cobertura_relatorio as cobertura_repo
from app.repositories import convenios as convenios_repo
from app.repositories import execucoes as execucoes_repo
from app.repositories import monitoramento as monitoramento_repo


@pytest.mark.db
def test_listar_familias_publicadas_inclui_tomografo():
    db = SessionLocal()
    try:
        assert "TOMOGRAFO" in execucoes_repo.listar_familias_publicadas(db)
    finally:
        db.close()


@pytest.mark.db
def test_listar_macro_coverage_filtra_por_uf():
    db = SessionLocal()
    try:
        exec_id = execucoes_repo.obter_execucao_publicada_mais_recente(db, "TOMOGRAFO")
        assert exec_id is not None

        com_filtro = cobertura_repo.listar_macro_coverage(db, execution_id=exec_id, ufs=["DF"])
        sem_bahia = cobertura_repo.listar_macro_coverage(db, execution_id=exec_id, ufs=["BA"])

        assert any(m.macro_code == "M1" for m in com_filtro)
        assert sem_bahia == []
    finally:
        db.close()


@pytest.mark.db
def test_listar_municipality_coverage_filtra_por_municipio():
    db = SessionLocal()
    try:
        exec_id = execucoes_repo.obter_execucao_publicada_mais_recente(db, "TOMOGRAFO")
        assert exec_id is not None

        rows = cobertura_repo.listar_municipality_coverage(
            db, execution_id=exec_id, ufs=["DF"], municipio="Cidade Alfa"
        )

        assert [r.municipality_name for r in rows] == ["Cidade Alfa"]
    finally:
        db.close()


@pytest.mark.db
def test_listar_convenios_filtrados_por_cnes():
    db = SessionLocal()
    try:
        rows = convenios_repo.listar_convenios_filtrados(db, cnes="9000001")
        assert [c.numero for c in rows] == ["__pytest_cnes_fk__"]

        vazio = convenios_repo.listar_convenios_filtrados(db, cnes="0000000")
        assert vazio == []
    finally:
        db.close()


@pytest.mark.db
def test_listar_convenios_filtrados_por_uf():
    db = SessionLocal()
    try:
        rows = convenios_repo.listar_convenios_filtrados(db, ufs=["ZZ"])
        assert rows == []
    finally:
        db.close()


@pytest.mark.db
def test_listar_instrumentos_filtra_por_uf_municipio_cnes():
    db = SessionLocal()
    try:
        por_uf = monitoramento_repo.listar_instrumentos(db, ufs=["DF"])
        assert any(i.nr_convenio == "948686" for i in por_uf)

        por_municipio = monitoramento_repo.listar_instrumentos(db, municipio="BRASILIA")
        assert any(i.nr_convenio == "948686" for i in por_municipio)

        por_cnes = monitoramento_repo.listar_instrumentos(db, cnes="0010456")
        assert [i.nr_convenio for i in por_cnes] == ["948686"]

        nenhum = monitoramento_repo.listar_instrumentos(db, ufs=["ZZ"])
        assert nenhum == []
    finally:
        db.close()
