"""Política de avisos do espelho SICONV: individual na rodada pequena, resumo para a gestão na grande."""

from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.db.base import engine
from app.db.models import (
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
    User,
    UserRole,
)
from scripts.job_verificacao_siconv import LIMITE_AVISOS_INDIVIDUAIS, avisar_mudancas

pytestmark = pytest.mark.db


@pytest.fixture
def db():
    conexao = engine.connect()
    transacao = conexao.begin()
    sessao = Session(bind=conexao, join_transaction_mode="create_savepoint")
    try:
        yield sessao
    finally:
        sessao.close()
        transacao.rollback()
        conexao.close()


def _usuario(db, role: UserRole) -> User:
    u = User(
        name=f"{role.value} aviso",
        email=f"pytest-aviso-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=role,
    )
    db.add(u)
    db.flush()
    return u


def _instrumento(db, titular: User | None) -> InstrumentoEquipamento:
    inst = InstrumentoEquipamento(
        nr_convenio=f"AVS{uuid4().hex[:8]}", nome_convenente="x", tipo_contratacao="Convênio"
    )
    db.add(inst)
    db.flush()
    if titular is not None:
        db.add(InstrumentoResponsavel(instrumento_id=inst.id, usuario_id=titular.id, papel="titular"))
        db.flush()
    return inst


def _quem_ve(db, notificacao_id: int) -> set[int]:
    return {
        d.usuario_id for d in db.query(NotificacaoDestinatario).filter_by(notificacao_id=notificacao_id).all()
    }


def _avisos(instrumentos):
    return [(i.id, i.nr_convenio, 1, "Situação do convênio: A → B") for i in instrumentos]


def test_rodada_pequena_avisa_titular_e_gestao_individualmente(db):
    titular, gestor = _usuario(db, UserRole.colaborador), _usuario(db, UserRole.gestor)
    inst = _instrumento(db, titular)

    assert avisar_mudancas(db, _avisos([inst]), rodada="r1") == 1
    db.flush()

    aviso = db.query(Notificacao).filter_by(tipo=NotificacaoTipo.atualizacao_api, entidade_id=inst.id).one()
    assert {titular.id, gestor.id} <= _quem_ve(db, aviso.id)


def test_rodada_grande_manda_individual_so_ao_titular_e_resumo_a_gestao(db):
    titular, gestor = _usuario(db, UserRole.colaborador), _usuario(db, UserRole.gestor)
    com_dono = _instrumento(db, titular)
    sem_dono = [_instrumento(db, None) for _ in range(LIMITE_AVISOS_INDIVIDUAIS)]

    criados = avisar_mudancas(db, _avisos([com_dono, *sem_dono]), rodada="r2")
    db.flush()

    # 1 individual (só o instrumento com titular) + 1 resumo; sem dono não vira aviso solto.
    assert criados == 2
    individual = (
        db.query(Notificacao)
        .filter_by(entidade_id=com_dono.id, tipo=NotificacaoTipo.atualizacao_api)
        .filter(Notificacao.chave_dedup.is_(None))
        .one()
    )
    assert _quem_ve(db, individual.id) == {titular.id}
    resumo = db.query(Notificacao).filter_by(chave_dedup="siconv-resumo:r2").one()
    assert gestor.id in _quem_ve(db, resumo.id)
    assert titular.id not in _quem_ve(db, resumo.id)
    assert "Convênio" in resumo.corpo and str(1 + LIMITE_AVISOS_INDIVIDUAIS) in resumo.titulo


def test_leitor_nunca_recebe(db):
    leitor = _usuario(db, UserRole.leitor)
    inst = _instrumento(db, leitor)
    avisar_mudancas(db, _avisos([inst]), rodada="r3")
    db.flush()
    aviso = db.query(Notificacao).filter_by(entidade_id=inst.id, tipo=NotificacaoTipo.atualizacao_api).one()
    assert leitor.id not in _quem_ve(db, aviso.id)
