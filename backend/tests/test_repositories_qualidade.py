"""Branches de queries não triviais dos repositories de apoio."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import Notificacao, NotificacaoTipo, PropostaCandidata, User, UserRole
from app.repositories.notificacoes import (
    criar_notificacao,
    listar_notificacoes_paginadas,
    mapear_identificadores_instrumentos,
    mapear_ids_propostas,
    marcar_destinatario_lido,
    obter_destinatario,
)
from app.repositories.propostas_candidatas import FiltrosPropostaCandidata, listar_propostas_paginadas


def test_repository_notificacoes_filtra_nao_lidas_e_retorna_vazios_sem_ids():
    """Desde o Plan Mode notificacoes-escopo (2026-09-25), leitura é
    escopada por usuario_id -- cria um usuário de teste, materializa via
    criar_notificacao (broadcast pra tipo=proposta_candidata) e verifica a
    partir do ponto de vista desse usuário."""
    db = SessionLocal()
    try:
        usuario = User(
            name="Usuário Pytest",
            email=f"pytest-repo-notificacoes-{uuid4()}@example.com",
            password_hash=hash_password("senha"),
            role=UserRole.colaborador,
        )
        db.add(usuario)
        db.flush()

        nao_lida = Notificacao(tipo=NotificacaoTipo.proposta_candidata, titulo="não lida pytest", entidade_id=1)
        lida = Notificacao(tipo=NotificacaoTipo.proposta_candidata, titulo="lida pytest", entidade_id=2)
        criar_notificacao(db, nao_lida)
        criar_notificacao(db, lida)
        db.flush()

        destinatario_lida = obter_destinatario(db, notificacao_id=lida.id, usuario_id=usuario.id)
        assert destinatario_lida is not None
        marcar_destinatario_lido(db, destinatario_lida)
        db.flush()

        pagina = listar_notificacoes_paginadas(db, usuario_id=usuario.id, limit=100, offset=0, apenas_nao_lidas=True)

        assert all(not item.lida for item in pagina.itens)
        assert any(item.notificacao.id == nao_lida.id for item in pagina.itens)
        assert all(item.notificacao.id != lida.id for item in pagina.itens)
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
