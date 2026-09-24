"""Branches de queries não triviais dos repositories de apoio."""

from __future__ import annotations

from datetime import date

from app.db.base import SessionLocal
from app.db.models import Notificacao, NotificacaoTipo, PropostaCandidata
from app.repositories.notificacoes import (
    listar_notificacoes_paginadas,
    mapear_identificadores_instrumentos,
    mapear_ids_propostas,
)
from app.repositories.propostas_candidatas import FiltrosPropostaCandidata, listar_propostas_paginadas


def test_repository_notificacoes_filtra_nao_lidas_e_retorna_vazios_sem_ids():
    db = SessionLocal()
    try:
        db.add_all(
            [
                Notificacao(
                    tipo=NotificacaoTipo.proposta_candidata, titulo="não lida pytest", entidade_id=1, lida=False
                ),
                Notificacao(tipo=NotificacaoTipo.proposta_candidata, titulo="lida pytest", entidade_id=2, lida=True),
            ]
        )
        db.flush()

        pagina = listar_notificacoes_paginadas(db, limit=100, offset=0, apenas_nao_lidas=True)

        assert all(not item.lida for item in pagina.itens)
        assert pagina.nao_lidas >= 1
        assert mapear_identificadores_instrumentos(db, set()) == {}
        assert mapear_ids_propostas(db, set()) == set()
    finally:
        db.rollback()
        db.close()


def test_repository_propostas_aplica_todos_os_filtros_combinados():
    db = SessionLocal()
    try:
        alvo = PropostaCandidata(
            id_proposta=876_543_210,
            cnpj_ente_recebedor="00000000000100",
            nm_proponente="Proponente Cobertura Pytest",
            municipio="Brasília",
            uf="DF",
            ds_objeto="Tomógrafo",
            nm_programa="Programa Cobertura",
            id_programa=321,
            componente_batido="ONCOLOGIA",
            data_proposta=date(2026, 1, 2),
        )
        outro = PropostaCandidata(
            id_proposta=876_543_211,
            cnpj_ente_recebedor="00000000000200",
            nm_proponente="Outro Proponente",
            municipio="Goiânia",
            uf="GO",
            ds_objeto="Outro",
            nm_programa="Outro Programa",
            id_programa=322,
            componente_batido="ONCOLOGIA",
            data_proposta=date(2025, 1, 2),
        )
        db.add_all([alvo, outro])
        db.flush()

        total, itens = listar_propostas_paginadas(
            db,
            filtros=FiltrosPropostaCandidata(uf="DF", busca="Cobertura", ano=2026, id_programa=321),
            pagina=1,
            tamanho_pagina=10,
        )

        assert total == 1
        assert [item.id_proposta for item in itens] == [876_543_210]
    finally:
        db.rollback()
        db.close()
