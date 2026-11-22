"""Cancelamento de unidade planejada: regras do Service contra PostgreSQL real."""

from __future__ import annotations

import pytest

from app.domain_errors import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.schemas_entregas import CancelamentoUnidadeCreate, ReativacaoUnidadeCreate
from app.services import cancelamento_unidade as svc
from app.services import entregas_equipamento as entregas
from tests.test_entregas_equipamento_db import Cenario, _dados, _item, db  # noqa: F401

pytestmark = pytest.mark.db

MOTIVO = CancelamentoUnidadeCreate(motivo="Unidade cancelada pelo convenente")


def _situacao(sessao, c, item):
    leitura = entregas.listar_equipamentos_do_instrumento(nr_convenio=c.inst.nr_convenio, db=sessao, usuario=c.titular)
    return next(i for i in leitura.itens if i.id == item.id)


def test_cancelar_reduz_a_quantidade_a_entregar_e_o_item_fica_entregue(db):  # noqa: F811
    c = Cenario(db)
    svc.cancelar_unidade_planejada(item_id=c.dois.id, dados=MOTIVO, db=db, usuario=c.titular)
    entregas.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, 1)), db=db, usuario=c.titular)
    lido = _situacao(db, c, c.dois)
    assert (lido.quantidade_planejada, lido.quantidade_cancelada, lido.quantidade_entregue) == (2, 1, 1)
    assert lido.situacao == "entregue"


def test_entrega_acima_do_efetivo_e_bloqueada(db):  # noqa: F811
    c = Cenario(db)
    svc.cancelar_unidade_planejada(item_id=c.dois.id, dados=MOTIVO, db=db, usuario=c.titular)
    with pytest.raises(ValidationError, match="Quantidade acima do planejado"):
        entregas.registrar_entrega(
            nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, 2)), db=db, usuario=c.titular
        )


def test_cancelar_todas_sem_entrega_deixa_o_item_cancelado_e_nao_passa_disso(db):  # noqa: F811
    c = Cenario(db)
    svc.cancelar_unidade_planejada(item_id=c.um.id, dados=MOTIVO, db=db, usuario=c.titular)
    assert _situacao(db, c, c.um).situacao == "cancelado"
    with pytest.raises(ValidationError, match="unidade pendente"):
        svc.cancelar_unidade_planejada(item_id=c.um.id, dados=MOTIVO, db=db, usuario=c.titular)


def test_nao_cancela_unidade_ja_entregue(db):  # noqa: F811
    c = Cenario(db)
    entregas.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.um)), db=db, usuario=c.titular)
    with pytest.raises(ValidationError, match="unidade pendente"):
        svc.cancelar_unidade_planejada(item_id=c.um.id, dados=MOTIVO, db=db, usuario=c.titular)


def test_item_sem_controle_ou_sem_quantidade_nao_cancela(db):  # noqa: F811
    c = Cenario(db)
    for item in (c.livre, c.sem_qtd):
        with pytest.raises(ValidationError, match="quantidade planejada controlada"):
            svc.cancelar_unidade_planejada(item_id=item.id, dados=MOTIVO, db=db, usuario=c.titular)


def test_permissao_por_titularidade_e_papel(db):  # noqa: F811
    c = Cenario(db)
    for usuario in (c.outro, c.leitor):
        with pytest.raises(AuthorizationError):
            svc.cancelar_unidade_planejada(item_id=c.dois.id, dados=MOTIVO, db=db, usuario=usuario)
    svc.cancelar_unidade_planejada(item_id=c.dois.id, dados=MOTIVO, db=db, usuario=c.gestor)


def test_item_inexistente_e_motivo_curto(db):  # noqa: F811
    c = Cenario(db)
    with pytest.raises(NotFoundError):
        svc.cancelar_unidade_planejada(item_id=999999999, dados=MOTIVO, db=db, usuario=c.titular)
    with pytest.raises(ValueError):
        CancelamentoUnidadeCreate(motivo="oi")


def test_reativar_devolve_a_unidade_e_nao_repete(db):  # noqa: F811
    c = Cenario(db)
    cancelamento = svc.cancelar_unidade_planejada(item_id=c.um.id, dados=MOTIVO, db=db, usuario=c.titular)
    desfeito = svc.reativar_unidade_cancelada(
        cancelamento_id=cancelamento.id,
        dados=ReativacaoUnidadeCreate(motivo="Cancelamento lançado por engano"),
        db=db,
        usuario=c.titular,
    )
    assert desfeito.ativo is False
    assert _situacao(db, c, c.um).situacao == "pendente"
    with pytest.raises(ConflictError):
        svc.reativar_unidade_cancelada(
            cancelamento_id=cancelamento.id,
            dados=ReativacaoUnidadeCreate(motivo="Cancelamento lançado por engano"),
            db=db,
            usuario=c.titular,
        )


def test_listagem_expoe_os_cancelamentos_ativos(db):  # noqa: F811
    c = Cenario(db)
    cancelamento = svc.cancelar_unidade_planejada(item_id=c.dois.id, dados=MOTIVO, db=db, usuario=c.titular)
    lido = _situacao(db, c, c.dois)
    assert [x.id for x in lido.cancelamentos] == [cancelamento.id]
    assert lido.cancelamentos[0].motivo == MOTIVO.motivo
