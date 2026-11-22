"""Previsão de entrega por item: regras do Service, histórico append-only e avisos D-1/D0/D+1."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.db.models import Notificacao, NotificacaoTipo, PrevisaoEntregaItem
from app.domain_errors import AuthorizationError, NotFoundError, ValidationError
from app.schemas_entregas import CancelamentoUnidadeCreate, PrevisaoEntregaCreate, PrevisaoEntregaRemocao
from app.services import cancelamento_unidade
from app.services import entregas_equipamento as entregas
from app.services import previsoes_entrega as svc
from app.services.prazos_monitoramento import executar
from tests.test_entregas_equipamento_db import Cenario, _dados, _item, db  # noqa: F401

pytestmark = pytest.mark.db
HOJE = date(2026, 11, 18)


def _previsao(dias: int) -> PrevisaoEntregaCreate:
    return PrevisaoEntregaCreate(data_prevista=HOJE + timedelta(days=dias))


def _lido(sessao, c, item):
    leitura = entregas.listar_equipamentos_do_instrumento(nr_convenio=c.inst.nr_convenio, db=sessao, usuario=c.titular)
    return next(i for i in leitura.itens if i.id == item.id)


def _avisos(sessao, c) -> list[Notificacao]:
    return list(
        sessao.scalars(
            select(Notificacao).where(
                Notificacao.entidade_id == c.inst.id, Notificacao.tipo == NotificacaoTipo.prazo_previsao_entrega
            )
        )
    )


def test_define_e_aparece_na_listagem(db):  # noqa: F811
    c = Cenario(db)
    svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(10), db=db, usuario=c.titular)
    assert _lido(db, c, c.dois).previsao_entrega == HOJE + timedelta(days=10)


def test_alterar_mantem_historico_e_uma_unica_ativa(db):  # noqa: F811
    c = Cenario(db)
    svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(10), db=db, usuario=c.titular)
    nova = svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(20), db=db, usuario=c.titular)
    linhas = list(db.scalars(select(PrevisaoEntregaItem).where(PrevisaoEntregaItem.item_id == c.dois.id)))
    assert len(linhas) == 2
    antiga = next(x for x in linhas if x.id != nova.id)
    assert antiga.substituido_por_id == nova.id and antiga.deletado_em is not None
    assert _lido(db, c, c.dois).previsao_entrega == HOJE + timedelta(days=20)


def test_mesma_data_nao_cria_linha(db):  # noqa: F811
    c = Cenario(db)
    a = svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(10), db=db, usuario=c.titular)
    b = svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(10), db=db, usuario=c.titular)
    assert a.id == b.id


def test_remover_exige_previsao_e_faz_soft_delete(db):  # noqa: F811
    c = Cenario(db)
    remocao = PrevisaoEntregaRemocao(motivo="Prazo deixou de valer")
    with pytest.raises(NotFoundError):
        svc.remover_previsao_entrega(item_id=c.dois.id, dados=remocao, db=db, usuario=c.titular)
    svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(10), db=db, usuario=c.titular)
    removida = svc.remover_previsao_entrega(item_id=c.dois.id, dados=remocao, db=db, usuario=c.titular)
    assert removida.ativo is False
    assert _lido(db, c, c.dois).previsao_entrega is None
    assert db.scalar(select(PrevisaoEntregaItem).where(PrevisaoEntregaItem.item_id == c.dois.id)) is not None


def test_so_item_controlado_e_com_unidade_pendente(db):  # noqa: F811
    c = Cenario(db)
    with pytest.raises(ValidationError, match="controlado por unidade"):
        svc.definir_previsao_entrega(item_id=c.livre.id, dados=_previsao(5), db=db, usuario=c.titular)
    entregas.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.um)), db=db, usuario=c.titular)
    with pytest.raises(ValidationError, match="pendente"):
        svc.definir_previsao_entrega(item_id=c.um.id, dados=_previsao(5), db=db, usuario=c.titular)


def test_permissao_por_titularidade_e_papel(db):  # noqa: F811
    c = Cenario(db)
    for usuario in (c.outro, c.leitor):
        with pytest.raises(AuthorizationError):
            svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(5), db=db, usuario=usuario)
    svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(5), db=db, usuario=c.gestor)


@pytest.mark.parametrize("dias,janela", [(1, "D-1"), (0, "D0"), (-1, "D+1")])
def test_avisa_nas_tres_janelas_e_nao_repete(db, dias, janela):  # noqa: F811
    c = Cenario(db)
    svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(dias), db=db, usuario=c.titular)
    executar(db, hoje=HOJE, aplicar=True)
    executar(db, hoje=HOJE, aplicar=True)
    (aviso,) = _avisos(db, c)
    assert aviso.chave_dedup is not None and aviso.chave_dedup.endswith(f":{janela}")


def test_alterar_data_arquiva_o_aviso_antigo(db):  # noqa: F811
    c = Cenario(db)
    svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(0), db=db, usuario=c.titular)
    executar(db, hoje=HOJE, aplicar=True)
    svc.definir_previsao_entrega(item_id=c.dois.id, dados=_previsao(30), db=db, usuario=c.titular)
    resultado = executar(db, hoje=HOJE, aplicar=True)
    assert resultado.arquivados >= 1


def test_nao_avisa_quando_nao_resta_unidade_a_entregar(db):  # noqa: F811
    c = Cenario(db)
    svc.definir_previsao_entrega(item_id=c.um.id, dados=_previsao(0), db=db, usuario=c.titular)
    cancelamento_unidade.cancelar_unidade_planejada(
        item_id=c.um.id, dados=CancelamentoUnidadeCreate(motivo="Convenente desistiu"), db=db, usuario=c.titular
    )
    executar(db, hoje=HOJE, aplicar=True)
    assert _avisos(db, c) == []
