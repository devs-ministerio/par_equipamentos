"""Município no filtro: vale o do convenente e o do estabelecimento (CNES) que recebe o equipamento."""

from __future__ import annotations

import pytest

from app.db.base import SessionLocal
from app.db.models import CnesEstabelecimento, Convenio, PropostaCandidata
from app.repositories import convenios as convenios_repo
from app.repositories import propostas_candidatas_relatorio as propostas_repo
from app.repositories.cnes_municipio import cnes_do_municipio

CNES = "9990011"


@pytest.fixture
def db():
    sessao = SessionLocal()
    try:
        yield sessao
    finally:
        sessao.rollback()
        sessao.close()


def _cenario(db):
    db.add(CnesEstabelecimento(cnes=CNES, nome_estabelecimento="Hospital sintético", municipio="Campinas", uf="SP"))
    db.add(
        Convenio(
            numero="__pytest_fundo_estadual__",
            convenente_nome="FUNDO ESTADUAL DE SAUDE",
            municipio="SÃO PAULO",
            uf="SP",
            cnes=CNES,
        )
    )
    db.flush()


@pytest.mark.db
def test_convenio_do_fundo_estadual_aparece_no_municipio_do_estabelecimento(db):
    _cenario(db)
    numeros = {c.numero for c in convenios_repo.listar_convenios_filtrados(db, ufs=["SP"], municipio="campinas")}
    assert "__pytest_fundo_estadual__" in numeros
    sede = {c.numero for c in convenios_repo.listar_convenios_filtrados(db, ufs=["SP"], municipio="São Paulo")}
    assert "__pytest_fundo_estadual__" in sede
    outro = {c.numero for c in convenios_repo.listar_convenios_filtrados(db, ufs=["SP"], municipio="Santos")}
    assert "__pytest_fundo_estadual__" not in outro


@pytest.mark.db
def test_cnes_do_municipio_ignora_acento_caixa_e_respeita_a_uf(db):
    _cenario(db)
    assert CNES in cnes_do_municipio(db, "CAMPINAS", ["SP"])
    assert CNES not in cnes_do_municipio(db, "Campinas", ["BA"])
    assert CNES not in cnes_do_municipio(db, "Santos", ["SP"])


@pytest.mark.db
def test_proposta_tambem_usa_o_municipio_do_estabelecimento(db):
    _cenario(db)
    db.add(
        PropostaCandidata(
            id_proposta=987000111,
            cnpj_ente_recebedor="12345678000199",
            nm_proponente="FUNDO ESTADUAL DE SAUDE",
            nm_programa="Programa sintético",
            ds_objeto="Objeto sintético",
            id_programa="1",
            componente_batido="Componente sintético",
            municipio="SÃO PAULO",
            uf="SP",
            cnes=CNES,
        )
    )
    db.flush()
    ids = {p.id_proposta for p in propostas_repo.listar_propostas_filtradas(db, ufs=["SP"], municipio="Campinas")}
    assert 987000111 in ids
