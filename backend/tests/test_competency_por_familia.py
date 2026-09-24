"""Regressao do bug encontrado em 2026-08-21 ao rodar o pipeline de
RESSONANCIA pela primeira vez: `competency.label` (AAAA-MM) era UNIQUE
sozinho, sem levar `equipment_family` em conta. Como TOMOGRAFO e RESSONANCIA
publicam pra competencia do mesmo mes, as duas familias acabavam
compartilhando a MESMA linha de Competency -- e a rotina de "so a ultima
execucao da competencia fica publicada" (ver scripts/run_pipeline_*.py)
apagava a execucao (e MacroCoverage/MunicipalityCoverage/EquipmentOfferRow
inteiros) da OUTRA familia por engano. Dado real perdido uma vez nesta
sessao antes do fix (TOMOGRAFO inteiro sumiu do banco rodando o pipeline de
RESSONANCIA). Corrigido: unique agora e (label, equipment_family).
"""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.db.base import SessionLocal
from app.db.models import Competency


def test_mesma_competencia_pode_ter_uma_linha_por_familia():
    db = SessionLocal()
    try:
        tomografo = Competency(label="__teste_familia__", equipment_family="TOMOGRAFO")
        ressonancia = Competency(label="__teste_familia__", equipment_family="RESSONANCIA")
        db.add_all([tomografo, ressonancia])
        db.flush()  # nao pode levantar IntegrityError -- mesmo label, familia diferente

        db.rollback()  # nunca commita dado de teste
    finally:
        db.close()


def test_mesma_familia_na_mesma_competencia_ainda_e_unica():
    db = SessionLocal()
    try:
        db.add(Competency(label="__teste_familia_dup__", equipment_family="TOMOGRAFO"))
        db.flush()
        db.add(Competency(label="__teste_familia_dup__", equipment_family="TOMOGRAFO"))
        with pytest.raises(IntegrityError):
            db.flush()

        db.rollback()
    finally:
        db.close()
