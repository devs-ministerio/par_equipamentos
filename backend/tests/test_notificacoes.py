"""Testa app/routers/notificacoes.py -- Radar de Convenios (fluxo em
docs/arquitetura/fluxo_requisicao.md). Mesmo padrao de test_monitoramento.py:
chama as funcoes do router direto contra o banco real configurado, limpa o
que criou no `finally`."""

from uuid import uuid4

import pytest

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import Notificacao, NotificacaoTipo, User, UserRole
from app.domain_errors import NotFoundError
from app.repositories.notificacoes import criar_notificacao
from app.routers.notificacoes import listar_notificacoes, marcar_lida


def criar_usuario_teste(db):
    user = User(
        name="Usuário Pytest",
        email=f"pytest-notificacoes-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=UserRole.colaborador,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_listar_notificacoes_conta_nao_lidas_ignorando_filtro():
    """Contagem de nao_lidas e sempre sobre o total -- e o numero que
    alimenta o badge do menu, nao pode mudar so porque a lista visivel
    esta filtrada/paginada."""
    db = SessionLocal()
    usuario_teste = None
    ids_criados = []
    try:
        usuario_teste = criar_usuario_teste(db)
        for _ in range(3):
            n = Notificacao(
                tipo=NotificacaoTipo.proposta_candidata,
                titulo="Teste — apagar",
                entidade_id=1,
            )
            criar_notificacao(db, n)
            db.commit()
            ids_criados.append(n.id)
        # A 3a fica lida pra esse usuário -- as outras 2 continuam não lidas.
        marcar_lida(ids_criados[2], db, usuario_teste)

        resultado = listar_notificacoes(limit=1, offset=0, apenas_nao_lidas=True, db=db, usuario=usuario_teste)
        assert len(resultado.itens) == 1  # respeitou o limit
        assert resultado.nao_lidas >= 2  # ignora limit/apenas_nao_lidas
    finally:
        for id_ in ids_criados:
            db.query(Notificacao).filter_by(id=id_).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
        db.commit()
        db.close()


def test_marcar_lida_idempotente_e_404_pra_id_inexistente():
    db = SessionLocal()
    usuario_teste = None
    notificacao_id = None
    try:
        usuario_teste = criar_usuario_teste(db)
        # tipo=proposta_candidata (broadcast) em vez de edicao_manual --
        # edicao_manual/atualizacao_api são escopados por titular/suplente do
        # instrumento em entidade_id, e este teste não quer depender de dado
        # de instrumento pré-existente no banco compartilhado de teste (ver
        # test_service_notificacoes.py pro contrato de escopo por instrumento).
        n = Notificacao(tipo=NotificacaoTipo.proposta_candidata, titulo="Teste — apagar", entidade_id=1)
        criar_notificacao(db, n)
        db.commit()
        notificacao_id = n.id

        resultado = marcar_lida(notificacao_id, db, usuario_teste)
        assert resultado.lida is True
        # Marcar de novo nao quebra (idempotente).
        resultado2 = marcar_lida(notificacao_id, db, usuario_teste)
        assert resultado2.lida is True

        with pytest.raises(NotFoundError) as exc:
            marcar_lida(999_999_999, db, usuario_teste)
        assert exc.value.status_code == 404
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
        db.commit()
        db.close()
