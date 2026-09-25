"""Testa app/services/notificacoes.py -- Service unitario do piloto Router ->
Service -> Repository (Plan Mode backend 2026-09-17, Bloco C). Complementa
test_notificacoes.py (contrato de router)."""

from uuid import uuid4

import pytest

from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento, Notificacao, NotificacaoTipo, PropostaCandidata
from app.domain_errors import NotFoundError
from app.services.notificacoes import listar_notificacoes, marcar_notificacao_lida


def test_marcar_notificacao_lida_sucesso():
    db = SessionLocal()
    notificacao_id = None
    try:
        n = Notificacao(
            tipo=NotificacaoTipo.proposta_candidata,
            titulo=f"Teste service — apagar {uuid4()}",
            entidade_id=1,
            lida=False,
        )
        db.add(n)
        db.commit()
        db.refresh(n)
        notificacao_id = n.id

        resultado = marcar_notificacao_lida(db=db, notificacao_id=notificacao_id)
        assert resultado.lida is True
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        db.commit()
        db.close()


def test_marcar_notificacao_lida_id_inexistente_levanta_not_found_error():
    db = SessionLocal()
    try:
        with pytest.raises(NotFoundError) as exc:
            marcar_notificacao_lida(db=db, notificacao_id=999_999_999)
        assert exc.value.status_code == 404
    finally:
        db.close()


def test_listar_notificacoes_nao_lidas_ignora_paginacao():
    db = SessionLocal()
    ids_criados = []
    try:
        for lida in (False, False, True):
            n = Notificacao(
                tipo=NotificacaoTipo.proposta_candidata,
                titulo=f"Teste service — apagar {uuid4()}",
                entidade_id=1,
                lida=lida,
            )
            db.add(n)
            db.commit()
            db.refresh(n)
            ids_criados.append(n.id)

        pagina = listar_notificacoes(db=db, limit=1, offset=0, apenas_nao_lidas=True)
        assert len(pagina.itens) == 1
        assert pagina.nao_lidas >= 2
    finally:
        for id_ in ids_criados:
            db.query(Notificacao).filter_by(id=id_).delete()
        db.commit()
        db.close()


def test_listar_notificacoes_proposta_atualizada_resolve_destino_por_proposta():
    """Regressão: job_descoberta_transferegov.py gravava uma notificação de
    "proposta atualizada" com tipo=atualizacao_api mas entidade_id de uma
    PropostaCandidata -- listar_notificacoes tratava esse tipo como apontando
    pra InstrumentoEquipamento.id (contrato do docstring de
    db/models.py::Notificacao), então o destino resolvia contra a tabela
    errada. Corrigido pra tipo=proposta_candidata, que é o bucket certo pro
    id de uma PropostaCandidata (nova OU atualizada)."""
    db = SessionLocal()
    proposta_id = None
    notificacao_id = None
    try:
        proposta = PropostaCandidata(
            id_proposta=999_999,
            cnpj_ente_recebedor="00000000000191",
            nm_proponente="Teste service — apagar",
            ds_objeto="Teste",
            nm_programa="Teste",
            id_programa=1,
            componente_batido="Teste",
        )
        db.add(proposta)
        db.commit()
        db.refresh(proposta)
        proposta_id = proposta.id

        n = Notificacao(
            tipo=NotificacaoTipo.proposta_candidata,
            titulo=f"Proposta {proposta.id_proposta} atualizada",
            entidade_id=proposta.id,
            lida=False,
        )
        db.add(n)
        db.commit()
        db.refresh(n)
        notificacao_id = n.id

        pagina = listar_notificacoes(db=db, limit=20, offset=0, apenas_nao_lidas=False)
        item = next(i for i in pagina.itens if i.notificacao.id == notificacao_id)
        assert item.destino == "/monitoramento-equipamentos?aba=componentes&subaba=novas"
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if proposta_id is not None:
            db.query(PropostaCandidata).filter_by(id=proposta_id).delete()
        db.commit()
        db.close()


def test_listar_notificacoes_atualizacao_api_continua_resolvendo_por_instrumento():
    """Guarda o outro lado do contrato: tipo=atualizacao_api (job de
    verificação, achado real num InstrumentoEquipamento já monitorado)
    continua resolvendo destino contra InstrumentoEquipamento.id -- não pode
    regredir junto com a correção do teste acima."""
    db = SessionLocal()
    instrumento_id = None
    notificacao_id = None
    try:
        instrumento = InstrumentoEquipamento(
            nr_convenio=f"TESTE-{uuid4()}",
            nome_convenente="Teste service — apagar",
        )
        db.add(instrumento)
        db.commit()
        db.refresh(instrumento)
        instrumento_id = instrumento.id

        n = Notificacao(
            tipo=NotificacaoTipo.atualizacao_api,
            titulo="Teste service — apagar",
            entidade_id=instrumento.id,
            lida=False,
        )
        db.add(n)
        db.commit()
        db.refresh(n)
        notificacao_id = n.id

        pagina = listar_notificacoes(db=db, limit=20, offset=0, apenas_nao_lidas=False)
        item = next(i for i in pagina.itens if i.notificacao.id == notificacao_id)
        assert item.destino == f"/monitoramento-equipamentos/instrumentos/{instrumento.nr_convenio}"
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if instrumento_id is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
        db.commit()
        db.close()
