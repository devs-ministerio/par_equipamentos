"""Contrato gerencial de descoberta em schema sintético, sem coletor real."""

import pytest
from sqlalchemy import event, func, select

from app.db.models import Notificacao, NotificacaoDestinatario, NotificacaoTipo, UserStatus
from app.repositories.notificacoes import criar_avisos_descoberta, criar_notificacao
from app.services.notificacoes import listar_notificacoes
from tests.test_notificacoes_destinatarios_db import matriz as matriz


def aviso(entidade_id=1):
    return Notificacao(
        tipo=NotificacaoTipo.convenio_descoberto, titulo="Novo convênio sintético no Radar", entidade_id=entidade_id
    )


@pytest.mark.parametrize("perfil", ["admin", "gestor", "titular", "leitor", "admin_excluido", "gestor_inativo"])
def test_descoberta_so_materializa_destinatarios_gerenciais_ativos(matriz, perfil):
    db, usuarios, instrumento, _ = matriz
    registro = criar_notificacao(db, aviso(instrumento.id))
    db.commit()
    pagina = listar_notificacoes(
        db=db,
        usuario_id=usuarios[perfil].id,
        limit=20,
        offset=0,
        apenas_nao_lidas=False,
        tipo=NotificacaoTipo.convenio_descoberto,
    )
    assert pagina.total == pagina.nao_lidas == (1 if perfil in ("admin", "gestor") else 0)
    if pagina.itens:
        assert pagina.itens[0].notificacao.id == registro.id
        assert pagina.itens[0].destino is None  # Não usa instrumento com PK colidente.


def test_lote_resolve_destinatarios_uma_vez_sem_commit(matriz):
    db, usuarios, *_ = matriz
    ids = {usuarios["admin"].id, usuarios["gestor"].id}
    consultas = []

    def observar(_conn, _cursor, statement, _params, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            consultas.append(statement)

    bind = db.get_bind()
    event.listen(bind, "before_cursor_execute", observar)
    try:
        criar_avisos_descoberta(db, [aviso(101), aviso(102), aviso(103)])
    finally:
        event.remove(bind, "before_cursor_execute", observar)
    assert len(consultas) == 1
    db.flush()
    materializados = list(db.scalars(select(NotificacaoDestinatario)))
    assert len(materializados) == 6
    assert {d.usuario_id for d in materializados} == ids
    db.rollback()
    assert db.scalar(select(func.count()).select_from(Notificacao)) == 0
    assert db.scalar(select(func.count()).select_from(NotificacaoDestinatario)) == 0


def test_lote_sem_gestores_nao_faz_broadcast(matriz):
    db, usuarios, *_ = matriz
    usuarios["admin"].status = usuarios["gestor"].status = UserStatus.inactive
    db.commit()
    criar_avisos_descoberta(db, [aviso()])
    db.commit()
    assert db.scalar(select(func.count()).select_from(Notificacao)) == 1
    assert db.scalar(select(func.count()).select_from(NotificacaoDestinatario)) == 0


def test_lote_misto_rejeitado_antes_de_escrever(matriz):
    db, *_ = matriz
    outro = Notificacao(tipo=NotificacaoTipo.aprovacao_carteira, titulo="Aprovação não é descoberta", entidade_id=1)
    with pytest.raises(ValueError, match="somente avisos"):
        criar_avisos_descoberta(db, [aviso(), outro])
    assert db.scalar(select(func.count()).select_from(Notificacao)) == 0


def test_lote_vazio_nao_consulta_destinatarios(matriz, monkeypatch):
    db, *_ = matriz

    def proibido(*_args, **_kwargs):
        raise AssertionError("Lote vazio não deve consultar o banco")

    monkeypatch.setattr(db, "execute", proibido)
    criar_avisos_descoberta(db, [])
