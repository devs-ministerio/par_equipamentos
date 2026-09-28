"""app/services/relatorios.py -- FiltroRelatorio e montar_relatorio, os 2
relatórios (`instrumentos_repasse`/`analise_merito`) (Plan Mode
docs/arquitetura/planmode-relatorios-2026-09-25.md, Blocos 2, 4 e 5)."""

from __future__ import annotations

from io import BytesIO

import pytest
from docx import Document
from openpyxl import load_workbook

from app.db.base import SessionLocal
from app.domain_errors import ValidationError
from app.services.relatorios import FiltroRelatorio, montar_relatorio


def test_filtro_regiao_sem_valor_e_rejeitado():
    with pytest.raises(ValidationError):
        FiltroRelatorio(escopo="regiao")


def test_filtro_regiao_desconhecida_e_rejeitado():
    with pytest.raises(ValidationError):
        FiltroRelatorio(escopo="regiao", regiao="Atlantida")


def test_filtro_uf_sem_valor_e_rejeitado():
    with pytest.raises(ValidationError):
        FiltroRelatorio(escopo="uf")


def test_filtro_municipio_sem_uf_e_rejeitado():
    with pytest.raises(ValidationError):
        FiltroRelatorio(escopo="municipio", municipio="Cidade Alfa")


def test_filtro_cnes_sem_valor_e_rejeitado():
    with pytest.raises(ValidationError):
        FiltroRelatorio(escopo="cnes")


def test_filtro_brasil_nao_exige_nada():
    filtro = FiltroRelatorio(escopo="brasil")
    assert filtro.ufs() is None
    assert filtro.titulo() == "Brasil"


def test_filtro_regiao_resolve_ufs_da_regiao():
    filtro = FiltroRelatorio(escopo="regiao", regiao="Centro-Oeste")
    ufs = filtro.ufs()
    assert ufs is not None and "DF" in ufs


def test_filtro_cnes_nao_filtra_por_uf():
    filtro = FiltroRelatorio(escopo="cnes", cnes="9000001")
    assert filtro.ufs() is None
    assert filtro.titulo() == "CNES 9000001"


def test_filtro_titulo_inclui_ano_quando_informado():
    filtro = FiltroRelatorio(escopo="uf", uf="SP", ano=2023)
    assert filtro.titulo() == "UF SP -- 2023"


@pytest.mark.db
def test_instrumentos_repasse_xlsx_simplificado_tem_resumo_convenios_propostas_monitoramento():
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db,
            formato="xlsx",
            nivel="simplificado",
            tipo_relatorio="instrumentos_repasse",
            filtro=FiltroRelatorio(escopo="brasil"),
        )
        pasta = load_workbook(BytesIO(conteudo))
        assert pasta.sheetnames == ["Resumo", "Convênios", "Propostas candidatas", "Monitoramento"]
    finally:
        db.close()


@pytest.mark.db
def test_instrumentos_repasse_xlsx_completo_usa_timeline_de_monitoramento():
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db,
            formato="xlsx",
            nivel="completo",
            tipo_relatorio="instrumentos_repasse",
            filtro=FiltroRelatorio(escopo="uf", uf="DF"),
        )
        pasta = load_workbook(BytesIO(conteudo))
        assert "Monitoramento (timeline)" in pasta.sheetnames
        aba = pasta["Monitoramento (timeline)"]
        assert [c.value for c in aba[1]][:3] == ["Convênio", "Convenente", "Componente"]
    finally:
        db.close()


@pytest.mark.db
def test_instrumentos_repasse_docx_completo_narra_um_bloco_por_convenio():
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db,
            formato="docx",
            nivel="completo",
            tipo_relatorio="instrumentos_repasse",
            filtro=FiltroRelatorio(escopo="cnes", cnes="9000001"),
        )
        documento = Document(BytesIO(conteudo))
        textos = [p.text for p in documento.paragraphs]
        assert any("Convênio __pytest_cnes_fk__" in t for t in textos)
        assert any(t.startswith("Objeto:") for t in textos)
        assert any(t.startswith("Financeiro:") and "R$" in t for t in textos)
    finally:
        db.close()


@pytest.mark.db
def test_analise_merito_xlsx_so_tem_abas_de_cobertura():
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db,
            formato="xlsx",
            nivel="simplificado",
            tipo_relatorio="analise_merito",
            filtro=FiltroRelatorio(escopo="uf", uf="DF"),
        )
        pasta = load_workbook(BytesIO(conteudo))
        assert all(nome.startswith("Cobertura") for nome in pasta.sheetnames)
        assert "Convênios" not in pasta.sheetnames
        assert "Monitoramento" not in pasta.sheetnames
    finally:
        db.close()


@pytest.mark.db
def test_analise_merito_escopo_cnes_e_rejeitado():
    db = SessionLocal()
    try:
        with pytest.raises(ValidationError):
            montar_relatorio(
                db=db,
                formato="xlsx",
                nivel="simplificado",
                tipo_relatorio="analise_merito",
                filtro=FiltroRelatorio(escopo="cnes", cnes="9000001"),
            )
    finally:
        db.close()


@pytest.mark.db
def test_analise_merito_uf_sem_cobertura_gera_arquivo_valido_sem_quebrar():
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db,
            formato="xlsx",
            nivel="simplificado",
            tipo_relatorio="analise_merito",
            # UF sem nenhum dado de cobertura no seed sintético (só DF tem
            # linha de MacroCoverage) -- a família TOMOGRAFO existe, só não
            # tem dado pro AC; devolve aba com só cabeçalho, sem quebrar.
            filtro=FiltroRelatorio(escopo="uf", uf="AC"),
        )
        pasta = load_workbook(BytesIO(conteudo))
        assert pasta.sheetnames == ["Cobertura TOMOGRAFO"]
        assert pasta["Cobertura TOMOGRAFO"].max_row == 1
    finally:
        db.close()


@pytest.mark.db
def test_analise_merito_sem_familia_publicada_gera_arquivo_com_aviso_em_vez_de_quebrar(monkeypatch):
    import app.services.relatorios as relatorios_mod

    monkeypatch.setattr(relatorios_mod.execucoes_repo, "listar_familias_publicadas", lambda db: [])
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db,
            formato="xlsx",
            nivel="simplificado",
            tipo_relatorio="analise_merito",
            filtro=FiltroRelatorio(escopo="brasil"),
        )
        pasta = load_workbook(BytesIO(conteudo))
        assert pasta.sheetnames == ["Cobertura"]
        assert pasta["Cobertura"]["A2"].value.startswith("Nenhuma família")
    finally:
        db.close()


@pytest.mark.db
def test_montar_relatorio_docx_titulo_do_filtro():
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db,
            formato="docx",
            nivel="completo",
            tipo_relatorio="instrumentos_repasse",
            filtro=FiltroRelatorio(escopo="uf", uf="DF"),
        )
        documento = Document(BytesIO(conteudo))
        assert documento.paragraphs[0].text == "Instrumentos e repasse -- UF DF"
    finally:
        db.close()
