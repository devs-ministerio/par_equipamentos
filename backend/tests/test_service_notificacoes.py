"""Testa app/services/notificacoes.py -- Service unitario do piloto Router ->
Service -> Repository (Plan Mode backend 2026-09-17, Bloco C). Complementa
test_notificacoes.py (contrato de router)."""
from uuid import uuid4

import pytest

from app.db.base import SessionLocal
from app.db.models import Notificacao, NotificacaoTipo
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
