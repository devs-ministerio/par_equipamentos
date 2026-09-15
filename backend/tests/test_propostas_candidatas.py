"""Testa app/routers/propostas_candidatas.py -- Radar de Convenios (fluxo em
docs/arquitetura/fluxo_requisicao.md). Mesmo padrao de test_monitoramento.py:
chama as funcoes do router direto contra o banco real configurado, limpa o
que criou no `finally`."""
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento, PropostaCandidata, PropostaCandidataStatus, User, UserRole
from app.routers.propostas_candidatas import (
    DecisaoRevisao,
    RevisarPropostaBody,
    listar_propostas_candidatas,
    revisar_proposta,
)


def criar_usuario_teste(db):
    user = User(
        name="Usuário Pytest",
        email=f"pytest-propostas-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        cpf_hash="cpf-pytest",
        role=UserRole.colaborador,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def criar_proposta_teste(db, id_proposta: int):
    p = PropostaCandidata(
        id_proposta=id_proposta,
        cnpj_ente_recebedor="00000000000000",
        nm_proponente="Proponente Pytest — apagar",
        ds_objeto="Objeto de teste",
        nm_programa="Programa de teste",
        id_programa=1,
        componente_batido="Tomógrafo",
        vl_global_proposta=1000,
        situacao_proposta="Em análise",
        status=PropostaCandidataStatus.pendente,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_aceitar_proposta_cria_instrumento_com_id_proposta_como_nr_convenio():
    db = SessionLocal()
    usuario_teste = None
    proposta = None
    instrumento_id = None
    try:
        usuario_teste = criar_usuario_teste(db)
        proposta = criar_proposta_teste(db, id_proposta=888_000_001)

        pendentes = listar_propostas_candidatas(status=PropostaCandidataStatus.pendente, db=db)
        assert any(p.id == proposta.id for p in pendentes)

        resultado = revisar_proposta(
            proposta.id, RevisarPropostaBody(decisao=DecisaoRevisao.aceita), db=db, usuario=usuario_teste
        )
        assert resultado.status == PropostaCandidataStatus.aceita
        assert resultado.revisado_por == usuario_teste.id

        instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=str(proposta.id_proposta)).one()
        instrumento_id = instrumento.id
        assert instrumento.tipo_contratacao == "Parceria TransfereGov"
        assert instrumento.nome_convenente == proposta.nm_proponente

        # Já revisada -- revisar de novo é 409, não sobrescreve decisão.
        with pytest.raises(HTTPException) as exc:
            revisar_proposta(
                proposta.id, RevisarPropostaBody(decisao=DecisaoRevisao.rejeitada), db=db, usuario=usuario_teste
            )
        assert exc.value.status_code == 409
    finally:
        if instrumento_id is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
        if proposta is not None:
            db.query(PropostaCandidata).filter_by(id=proposta.id).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
        db.commit()
        db.close()


def test_rejeitar_proposta_nao_cria_instrumento():
    db = SessionLocal()
    usuario_teste = None
    proposta = None
    try:
        usuario_teste = criar_usuario_teste(db)
        proposta = criar_proposta_teste(db, id_proposta=888_000_002)

        resultado = revisar_proposta(
            proposta.id, RevisarPropostaBody(decisao=DecisaoRevisao.rejeitada), db=db, usuario=usuario_teste
        )
        assert resultado.status == PropostaCandidataStatus.rejeitada

        instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=str(proposta.id_proposta)).one_or_none()
        assert instrumento is None
    finally:
        if proposta is not None:
            db.query(PropostaCandidata).filter_by(id=proposta.id).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
        db.commit()
        db.close()
