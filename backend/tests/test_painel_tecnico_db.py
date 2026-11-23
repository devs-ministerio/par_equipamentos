"""Painel individual do técnico: região por UF, cobertura, escopo por papel (colaborador vê só o seu; gestão vê todos)."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.db.base import engine
from app.db.models import (
    Convenio,
    EventoMarco,
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    MarcoCatalogo,
    User,
    UserRole,
    UsuarioRegiaoMonitoramento,
)
from app.domain_errors import AuthorizationError
from app.services import painel_tecnico as svc

pytestmark = pytest.mark.db

UF = "ZZ"


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


def _usuario(db, role, nome="Técnico"):
    u = User(
        name=f"{nome} {uuid4().hex[:6]}",
        email=f"pytest-painel-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=role,
    )
    db.add(u)
    db.flush()
    return u


def _convenio(db, *, situacao="Em execução", tipo="Convênio", valor=1000):
    c = Convenio(
        numero=f"PT{uuid4().hex[:8]}",
        objeto="x",
        convenente_nome="x",
        uf=UF,
        situacao=situacao,
        tipo_contratacao=tipo,
        valor_global=valor,
    )
    db.add(c)
    db.flush()
    return c


def _cenario(db):
    tecnico = _usuario(db, UserRole.colaborador)
    outro = _usuario(db, UserRole.colaborador)
    db.add(UsuarioRegiaoMonitoramento(usuario_id=tecnico.id, uf=UF))
    monitorado = _convenio(db)
    inst = InstrumentoEquipamento(
        nr_convenio=monitorado.numero, nome_convenente="x", tipo_contratacao="Convênio", uf=UF
    )
    db.add(inst)
    db.flush()
    db.add(InstrumentoResponsavel(instrumento_id=inst.id, usuario_id=tecnico.id, papel="titular"))
    marco = db.execute(select(MarcoCatalogo).order_by(MarcoCatalogo.id)).scalars().first()
    db.add(EventoMarco(instrumento_id=inst.id, marco_id=marco.id, data_ocorrencia=date.today(), autor_id=tecnico.id))
    _convenio(db, valor=500)
    _convenio(db, situacao="Prestação de Contas Concluída", valor=300)
    _convenio(db, tipo="PERSUS II")
    db.flush()
    return tecnico, outro


def test_painel_do_colaborador_cobre_a_regiao_e_conta_o_que_falta(db):
    tecnico, _ = _cenario(db)
    p = svc.obter_painel(db=db, usuario=tecnico)
    assert p.escopo == "individual" and p.ufs == [UF]
    assert (p.carteira.elegiveis, p.carteira.monitorados) == (3, 1)  # PERSUS II fica fora
    assert (p.carteira.faltam_em_aberto, p.carteira.faltam_concluidos) == (1, 1)
    assert p.carteira.valor_faltam_em_aberto == 500
    assert p.meus.instrumentos == 1 and p.meus.com_registro == 1
    assert p.atividade.lancamentos_total == 1


def test_colaborador_nao_ve_painel_de_outro(db):
    tecnico, outro = _cenario(db)
    with pytest.raises(AuthorizationError):
        svc.obter_painel(db=db, usuario=tecnico, usuario_id=outro.id)
    with pytest.raises(AuthorizationError):
        svc.listar_tecnicos(db=db, usuario=tecnico)


def test_gestao_filtra_por_colaborador_e_ve_todos(db):
    tecnico, _ = _cenario(db)
    gestor = _usuario(db, UserRole.gestor)
    todos = svc.obter_painel(db=db, usuario=gestor)
    assert todos.escopo == "todos" and todos.ufs is None and todos.usuario is None
    um = svc.obter_painel(db=db, usuario=gestor, usuario_id=tecnico.id)
    assert um.escopo == "individual" and um.usuario is not None and um.usuario.id == tecnico.id
    assert um.carteira.faltam_em_aberto == 1
    assert tecnico.id in {t.id for t in svc.listar_tecnicos(db=db, usuario=gestor)}
