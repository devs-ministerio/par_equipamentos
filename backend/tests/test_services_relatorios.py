"""app/services/relatorios.py -- FiltroRelatorio e montar_relatorio (Plan
Mode docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 2)."""

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


@pytest.mark.db
def test_montar_relatorio_xlsx_brasil_simplificado_tem_3_abas_ou_mais():
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db, formato="xlsx", nivel="simplificado", filtro=FiltroRelatorio(escopo="brasil")
        )
        pasta = load_workbook(BytesIO(conteudo))
        assert "Convênios" in pasta.sheetnames
        assert "Monitoramento" in pasta.sheetnames
        assert any(nome.startswith("Cobertura ") for nome in pasta.sheetnames)
    finally:
        db.close()


@pytest.mark.db
def test_montar_relatorio_xlsx_cnes_nao_gera_aba_de_cobertura():
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db, formato="xlsx", nivel="completo", filtro=FiltroRelatorio(escopo="cnes", cnes="9000001")
        )
        pasta = load_workbook(BytesIO(conteudo))
        assert pasta.sheetnames == ["Convênios", "Monitoramento"]
    finally:
        db.close()


@pytest.mark.db
def test_montar_relatorio_docx_gera_documento_com_titulo_do_filtro():
    db = SessionLocal()
    try:
        conteudo = montar_relatorio(
            db=db, formato="docx", nivel="completo", filtro=FiltroRelatorio(escopo="uf", uf="DF")
        )
        documento = Document(BytesIO(conteudo))
        assert documento.paragraphs[0].text == "Relatório UF DF"
    finally:
        db.close()
