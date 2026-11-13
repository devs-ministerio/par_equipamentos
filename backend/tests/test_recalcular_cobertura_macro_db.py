"""Recálculo de `macro_coverage` gravada com regra de arredondamento antiga (D32)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.db.base import SessionLocal
from app.db.models import (
    AuditLog,
    Competency,
    DeficitStatus,
    Execution,
    ExecutionMode,
    ExecutionStatus,
    MacroCoverage,
)
from scripts.recalcular_cobertura_macro import recalcular

FAMILIA = "PET_CT"


@pytest.fixture
def macros():
    db = SessionLocal()
    try:
        competencia = Competency(label="__teste_recalculo_macro__", equipment_family=FAMILIA)
        db.add(competencia)
        db.flush()
        execucao = Execution(
            competency_id=competencia.id,
            version=1,
            mode=ExecutionMode.automatic,
            status=ExecutionStatus.published,
            started_at=datetime.now(UTC),
            config_chave_macrorregiao="ibge_municipio",
            config_denominador_oferta="qt_existente_sus",
            active_sources={},
        )
        db.add(execucao)
        db.flush()

        def macro(codigo, populacao, disponivel, necessario, saldo, status, necessidade=0):
            linha = MacroCoverage(
                execution_id=execucao.id,
                macro_code=codigo,
                macro_name=f"Macro {codigo}",
                state="AC",
                equipment_family=FAMILIA,
                population=populacao,
                available_qty=disponivel,
                existing_qty=disponivel,
                required_qty=necessario,
                estimated_need=necessidade,
                balance=saldo,
                deficit_status=status,
            )
            db.add(linha)
            return linha

        # Gravada com piso: 843.163 / 1.500.000 = 0,56 -> piso 0 (errado); teto 1 (certo), saldo -1, hipossuficiente.
        sem_oferta = macro("T1", 843_163, 0, 0, 0, DeficitStatus.not_deficient)
        # Já correta: 3.100.000 / 1.500.000 = 2,07 -> teto 3, oferta 3, saldo 0.
        correta = macro("T2", 3_100_000, 3, 3, 0, DeficitStatus.not_deficient, necessidade=3_100_000 / 1_500_000)
        # Sem população: não é tocada.
        sem_populacao = macro("T3", None, 0, 0, 0, DeficitStatus.not_available)
        db.flush()
        yield db, execucao, sem_oferta, correta, sem_populacao
        db.rollback()  # nunca commita dado de teste
    finally:
        db.close()


def test_simulacao_nao_altera_nada(macros):
    db, execucao, sem_oferta, *_ = macros
    r = recalcular(db, aplicar=False, execucao_id=execucao.id)
    assert r.alteradas == 1 and r.examinadas == 3
    assert sem_oferta.required_qty == 0 and sem_oferta.deficit_status == DeficitStatus.not_deficient


def test_aplicar_corrige_so_a_macro_divergente_e_audita(macros):
    db, execucao, sem_oferta, correta, sem_populacao = macros
    r = recalcular(db, aplicar=True, execucao_id=execucao.id)
    assert r.alteradas == 1
    assert sem_oferta.required_qty == 1
    assert sem_oferta.balance == -1
    assert sem_oferta.deficit_status == DeficitStatus.deficient
    assert correta.required_qty == 3 and correta.deficit_status == DeficitStatus.not_deficient
    assert sem_populacao.deficit_status == DeficitStatus.not_available
    auditorias = db.query(AuditLog).filter_by(entity_name="macro_coverage", entity_id=sem_oferta.id).all()
    assert len(auditorias) == 1 and auditorias[0].action == "recalculated"


def test_segunda_rodada_e_idempotente(macros):
    db, execucao, *_ = macros
    recalcular(db, aplicar=True, execucao_id=execucao.id)
    assert recalcular(db, aplicar=True, execucao_id=execucao.id).alteradas == 0
