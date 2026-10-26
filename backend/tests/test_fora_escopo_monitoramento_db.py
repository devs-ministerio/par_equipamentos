"""Convênio fora de escopo (só obra) fica no banco e some de monitoramento, avisos, prazos e relatórios."""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.db.base import engine
from app.db.models import (
    AcaoMonitoramento,
    Convenio,
    InstrumentoEquipamento,
    Notificacao,
    NotificacaoTipo,
    User,
    UserRole,
)
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import criar_notificacao, listar_notificacoes_paginadas
from app.services.monitoramento_instrumentos import listar_instrumentos_monitorados
from app.services.prazos_monitoramento import executar
from scripts.marcar_fora_escopo_obras import marcar, so_obra_ou_servico

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


def _convenio(db, itens):
    numero = f"OBR{uuid4().hex[:8]}"
    conv = Convenio(
        numero=numero,
        objeto="x",
        convenente_nome="x",
        siconv_raw={"itens_plano_aplicacao": itens},
    )
    db.add(conv)
    inst = InstrumentoEquipamento(nr_convenio=numero, nome_convenente="x", tipo_contratacao="Convênio")
    db.add(inst)
    db.flush()
    return conv, inst


OBRA = [{"ID_ITEM_PAD": "1", "TIPO_DESPESA_ITEM": "OBRA", "DESCRICAO_ITEM": "Reforma"}]
BEM = [{"ID_ITEM_PAD": "2", "TIPO_DESPESA_ITEM": "BEM", "DESCRICAO_ITEM": "Mamógrafo"}]


def test_criterio_so_obra_ou_servico(db):
    so_obra, _ = _convenio(db, OBRA)
    misto, _ = _convenio(db, OBRA + BEM)
    vazio, _ = _convenio(db, [])
    assert so_obra_ou_servico(so_obra) and not so_obra_ou_servico(misto) and not so_obra_ou_servico(vazio)


def test_script_simula_marca_desfaz_e_e_idempotente(db):
    conv, _ = _convenio(db, OBRA)
    marcar(db, aplicar=False, desfazer=False)
    assert conv.fora_escopo_equipamentos is False
    marcar(db, aplicar=True, desfazer=False)
    assert conv.fora_escopo_equipamentos is True
    assert marcar(db, aplicar=True, desfazer=False).alterados == 0
    marcar(db, aplicar=True, desfazer=True)
    assert conv.fora_escopo_equipamentos is False


def test_instrumento_de_convenio_fora_de_escopo_some_do_monitoramento(db):
    conv, inst = _convenio(db, OBRA)
    assert monitoramento_repo.obter_instrumento_por_nr_convenio(db, inst.nr_convenio) is not None
    conv.fora_escopo_equipamentos = True
    db.flush()
    assert monitoramento_repo.obter_instrumento_por_nr_convenio(db, inst.nr_convenio) is None
    assert inst.nr_convenio not in {
        i.instrumento.nr_convenio for i in listar_instrumentos_monitorados(db=db, limit=5000)
    }
    assert inst.nr_convenio not in {
        i.nr_convenio
        for i in monitoramento_repo.carregar_dados_resumo_monitoramento(db, hoje=date.today()).instrumentos
    }
    assert inst.id not in {i.id for lote in monitoramento_repo.iterar_instrumentos_relatorio(db) for i in lote}


def test_aviso_de_prazo_nao_nasce_e_notificacao_existente_some(db):
    conv, inst = _convenio(db, OBRA)
    usuario = User(
        name="Gestor", email=f"pytest-fe-{uuid4()}@example.com", password_hash=hash_password("s"), role=UserRole.gestor
    )
    db.add(usuario)
    db.add(AcaoMonitoramento(instrumento_id=inst.id, descricao="x", data_prevista=date.today() + timedelta(days=1)))
    db.flush()
    criar_notificacao(
        db, Notificacao(tipo=NotificacaoTipo.edicao_manual, titulo="antiga", corpo="x", entidade_id=inst.id)
    )
    db.flush()

    def titulos():
        pagina = listar_notificacoes_paginadas(db, usuario_id=usuario.id, limit=500, offset=0, apenas_nao_lidas=False)
        return {i.notificacao.entidade_id for i in pagina.itens}

    assert inst.id in titulos()
    conv.fora_escopo_equipamentos = True
    db.flush()
    assert inst.id not in titulos()
    r = executar(db, hoje=date.today(), aplicar=True)
    novos = (
        db.query(Notificacao)
        .filter(Notificacao.entidade_id == inst.id, Notificacao.tipo == NotificacaoTipo.prazo_acao)
        .count()
    )
    assert novos == 0 and r.bloqueado is False
