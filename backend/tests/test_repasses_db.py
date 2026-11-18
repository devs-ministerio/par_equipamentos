"""Repasse integral/parcial e fase calculada do acompanhamento, contra PostgreSQL real."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import Convenio, InstrumentoEquipamento, RepasseInstrumento, User, UserRole
from app.domain_errors import AuthorizationError, NotFoundError
from app.schemas_repasses import RepasseCreate
from app.services import repasses as servico

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


def _usuario(db, papel: UserRole) -> User:
    sufixo = uuid4().hex[:8]
    usuario = User(name=f"Teste {sufixo}", email=f"rep-{sufixo}@exemplo.local", password_hash="x", role=papel)
    db.add(usuario)
    db.flush()
    return usuario


@pytest.fixture
def instrumento(db):
    numero = f"REP{uuid4().hex[:6]}"
    db.add(
        Convenio(
            numero=numero,
            objeto="x",
            convenente_nome="x",
            uf="SP",
            situacao="Em execução",
            valor_repasse=1000,
            siconv_raw={"desembolsos": [{"VL_DESEMBOLSADO": "400"}]},
        )
    )
    inst = InstrumentoEquipamento(
        nr_convenio=numero, nome_convenente="Repasse", tipo_contratacao="Convênio", uf="SP", ano_instrumento=2025
    )
    db.add(inst)
    db.flush()
    return inst


def test_tipo_da_fonte_integral_parcial_e_sem_desembolso():
    assert servico.tipo_repasse_pela_fonte(valor_previsto=1000, desembolsos=[]) is None
    assert servico.tipo_repasse_pela_fonte(valor_previsto=1000, desembolsos=[{"VL_DESEMBOLSADO": "400"}]) == "parcial"
    cheio = [{"VL_DESEMBOLSADO": "600"}, {"VL_DESEMBOLSADO": "400"}]
    assert servico.tipo_repasse_pela_fonte(valor_previsto=1000, desembolsos=cheio) == "integral"
    assert servico.tipo_repasse_pela_fonte(valor_previsto=None, desembolsos=cheio) == "parcial"


def test_repasse_manual_e_idempotente_e_troca_de_tipo_substitui(db, instrumento):
    admin = _usuario(db, UserRole.admin)
    primeiro = servico.registrar_repasse_manual(
        nr_convenio=instrumento.nr_convenio, dados=RepasseCreate(tipo="parcial"), db=db, usuario=admin
    )
    repetido = servico.registrar_repasse_manual(
        nr_convenio=instrumento.nr_convenio, dados=RepasseCreate(tipo="parcial"), db=db, usuario=admin
    )
    assert repetido.id == primeiro.id
    integral = servico.registrar_repasse_manual(
        nr_convenio=instrumento.nr_convenio,
        dados=RepasseCreate(tipo="integral", justificativa="Quitado"),
        db=db,
        usuario=admin,
    )
    assert integral.id != primeiro.id
    antigo = db.get(RepasseInstrumento, primeiro.id)
    assert antigo.substituido_por_id == integral.id and antigo.deletado_em is not None


def test_leitor_nao_confirma_repasse(db, instrumento):
    with pytest.raises(AuthorizationError):
        servico.registrar_repasse_manual(
            nr_convenio=instrumento.nr_convenio,
            dados=RepasseCreate(tipo="integral"),
            db=db,
            usuario=_usuario(db, UserRole.leitor),
        )


def test_instrumento_inexistente_devolve_nao_encontrado(db):
    with pytest.raises(NotFoundError):
        servico.obter_situacao_repasse(nr_convenio="NAOEXISTE", db=db)


def test_fonte_prevalece_so_sem_confirmacao_manual_e_a_fase_acompanha(db, instrumento):
    assert servico.obter_situacao_repasse(nr_convenio=instrumento.nr_convenio, db=db).fase_calculada == (
        "Aguardando repasse"
    )
    servico.derivar_repasse_da_fonte(instrumento=instrumento, db=db)
    situacao = servico.obter_situacao_repasse(nr_convenio=instrumento.nr_convenio, db=db)
    assert (situacao.repasse.origem, situacao.repasse.tipo, situacao.fase_calculada) == (
        "fonte",
        "parcial",
        "Valor repassado",
    )
    servico.registrar_repasse_manual(
        nr_convenio=instrumento.nr_convenio,
        dados=RepasseCreate(tipo="integral"),
        db=db,
        usuario=_usuario(db, UserRole.admin),
    )
    assert servico.obter_situacao_repasse(nr_convenio=instrumento.nr_convenio, db=db).repasse.origem == "manual"
    assert servico.derivar_repasse_da_fonte(instrumento=instrumento, db=db).tipo == "parcial"
