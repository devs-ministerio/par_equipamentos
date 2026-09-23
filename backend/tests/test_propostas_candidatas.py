"""Contrato de leitura do Radar de Convênios."""
from uuid import uuid4

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import PropostaCandidata, User, UserRole
from app.routers.propostas_candidatas import listar_propostas_candidatas


def criar_usuario_teste(db):
    usuario = User(
        name="Usuário Pytest",
        email=f"pytest-propostas-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=UserRole.colaborador,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def test_listagem_de_propostas_nao_expoe_ciclo_legado_de_revisao():
    db = SessionLocal()
    usuario = proposta = None
    try:
        usuario = criar_usuario_teste(db)
        proposta = PropostaCandidata(
            id_proposta=888_000_001,
            cnpj_ente_recebedor="00000000000000",
            nm_proponente="Proponente Pytest — apagar",
            ds_objeto="Objeto de teste",
            nm_programa="Programa de teste",
            id_programa=1,
            componente_batido="Tomógrafo",
            vl_global_proposta=1000,
            situacao_proposta="Em análise",
        )
        db.add(proposta)
        db.commit()
        db.refresh(proposta)

        resultado = listar_propostas_candidatas(pagina=1, tamanho_pagina=50, db=db, usuario=usuario)
        item = next(p for p in resultado.itens if p.id == proposta.id)

        assert item.id_proposta == proposta.id_proposta
        assert not hasattr(item, "status")
        assert not hasattr(item, "revisado_em")
    finally:
        if proposta is not None:
            db.query(PropostaCandidata).filter_by(id=proposta.id).delete()
        if usuario is not None:
            db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()
