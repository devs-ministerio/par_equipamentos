"""Conclusão do acompanhamento: resultado calculado, impedimentos, bloqueios e reabertura."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.db.models import AcaoMonitoramento, EventoMarco, MarcoCatalogo
from app.domain_errors import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.schemas_conclusao import ConclusaoCreate, ReaberturaCreate
from app.schemas_entregas import CancelamentoUnidadeCreate
from app.services import cancelamento_unidade
from app.services import conclusao_acompanhamento as svc
from app.services import entregas_equipamento as entregas
from app.services.conclusao_acompanhamento import ItemParaConclusao as I
from app.services.fase_acompanhamento import FaseAcompanhamento, calcular_fase_acompanhamento
from app.services.repasses import fatos_do_instrumento
from tests.test_entregas_equipamento_db import Cenario, _dados, _item, db  # noqa: F401

pytestmark = pytest.mark.db


@pytest.mark.parametrize(
    "itens,esperado",
    [
        ([], "sem_entregas"),
        ([I(2, 0, 2)], "sem_entregas"),
        ([I(2, 2, 0)], "integral"),
        ([I(2, 2, 0), I(1, 1, 0)], "integral"),
        ([I(2, 1, 1)], "parcial"),
        ([I(2, 2, 0), I(1, 0, 1)], "parcial"),
        ([I(None, 1, 0)], "integral"),
    ],
)
def test_calcula_o_resultado(itens, esperado):
    assert svc.calcular_resultado(itens) == esperado


@pytest.mark.parametrize(
    "item,pendentes",
    [(I(2, 0, 0), 2), (I(2, 1, 0), 1), (I(2, 1, 1), 0), (I(2, 0, 2), 0), (I(None, 0, 0), 1), (I(None, 1, 0), 0)],
)
def test_unidades_pendentes(item, pendentes):
    assert svc.unidades_pendentes(item) == pendentes


def _preparar(sessao) -> Cenario:
    c = Cenario(sessao)
    c.sem_qtd.ativo = False  # item sem quantidade nunca prova entrega completa
    sessao.flush()
    return c


def _confirmar(resultado, **kw) -> ConclusaoCreate:
    return ConclusaoCreate(resultado_confirmado=resultado, data_conclusao=date.today(), **kw)


def _entregar_tudo(sessao, c):
    entregas.registrar_entrega(
        nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, 2), _item(c.um)), db=sessao, usuario=c.titular
    )


def test_conclui_integral_sem_justificativa_e_a_fase_vira_concluido(db):  # noqa: F811
    c = _preparar(db)
    _entregar_tudo(db, c)
    avaliacao = svc.avaliar_conclusao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert avaliacao.resultado == "integral" and avaliacao.impedimentos == [] and not avaliacao.exige_justificativa
    svc.concluir_acompanhamento(nr_convenio=c.inst.nr_convenio, dados=_confirmar("integral"), db=db, usuario=c.titular)
    fase = calcular_fase_acompanhamento(fatos_do_instrumento(db, c.inst))
    assert fase == FaseAcompanhamento.concluido


def _cancelar_tudo(sessao, c):
    for item, quantidade in ((c.dois, 2), (c.um, 1)):
        for _ in range(quantidade):
            cancelamento_unidade.cancelar_unidade_planejada(
                item_id=item.id,
                dados=CancelamentoUnidadeCreate(motivo="Convenente desistiu"),
                db=sessao,
                usuario=c.titular,
            )


def test_item_pendente_impede_concluir_mesmo_sem_nenhuma_entrega(db):  # noqa: F811
    c = _preparar(db)
    avaliacao = svc.avaliar_conclusao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert {i.tipo for i in avaliacao.impedimentos} == {"item_pendente"}
    assert len(avaliacao.impedimentos) == 2 and avaliacao.itens_completos == 0
    with pytest.raises(ValidationError, match="sem entrega nem cancelamento"):
        svc.concluir_acompanhamento(
            nr_convenio=c.inst.nr_convenio,
            dados=_confirmar("sem_entregas", justificativa="Encerrado"),
            db=db,
            usuario=c.titular,
        )


def test_entrega_parcial_com_unidade_pendente_nao_conclui(db):  # noqa: F811
    c = _preparar(db)
    entregas.registrar_entrega(
        nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.um), _item(c.dois, 1)), db=db, usuario=c.titular
    )
    avaliacao = svc.avaliar_conclusao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert [i.tipo for i in avaliacao.impedimentos] == ["item_pendente"]


def test_sem_entregas_so_quando_tudo_foi_cancelado_e_exige_justificativa(db):  # noqa: F811
    c = _preparar(db)
    _cancelar_tudo(db, c)
    avaliacao = svc.avaliar_conclusao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert avaliacao.resultado == "sem_entregas" and avaliacao.impedimentos == [] and avaliacao.exige_justificativa
    with pytest.raises(ValidationError, match="justificativa"):
        svc.concluir_acompanhamento(
            nr_convenio=c.inst.nr_convenio, dados=_confirmar("sem_entregas"), db=db, usuario=c.titular
        )
    feito = svc.concluir_acompanhamento(
        nr_convenio=c.inst.nr_convenio,
        dados=_confirmar("sem_entregas", justificativa="Convênio encerrado sem entregas"),
        db=db,
        usuario=c.titular,
    )
    assert feito.resultado == "sem_entregas"


def test_parcial_entrega_mais_cancelamento_exige_justificativa(db):  # noqa: F811
    c = _preparar(db)
    entregas.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.um)), db=db, usuario=c.titular)
    for _ in range(2):
        cancelamento_unidade.cancelar_unidade_planejada(
            item_id=c.dois.id, dados=CancelamentoUnidadeCreate(motivo="Convenente desistiu"), db=db, usuario=c.titular
        )
    avaliacao = svc.avaliar_conclusao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert avaliacao.resultado == "parcial" and avaliacao.impedimentos == []
    with pytest.raises(ValidationError, match="justificativa"):
        svc.concluir_acompanhamento(
            nr_convenio=c.inst.nr_convenio, dados=_confirmar("parcial"), db=db, usuario=c.titular
        )


def test_instrumento_sem_item_controlado_nao_conclui(db):  # noqa: F811
    c = _preparar(db)
    for item in (c.dois, c.um):
        item.ativo = False
    db.flush()
    avaliacao = svc.avaliar_conclusao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert [i.tipo for i in avaliacao.impedimentos] == ["sem_item_controlado"]


def test_resultado_desatualizado_e_recusado(db):  # noqa: F811
    c = _preparar(db)
    _entregar_tudo(db, c)
    with pytest.raises(ConflictError, match="mudou"):
        svc.concluir_acompanhamento(
            nr_convenio=c.inst.nr_convenio,
            dados=_confirmar("parcial", justificativa="x" * 10),
            db=db,
            usuario=c.titular,
        )


def test_acao_aberta_impede_a_conclusao(db):  # noqa: F811
    c = _preparar(db)
    _entregar_tudo(db, c)
    db.add(AcaoMonitoramento(instrumento_id=c.inst.id, descricao="Cobrar relatório fotográfico"))
    db.flush()
    avaliacao = svc.avaliar_conclusao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert [i.tipo for i in avaliacao.impedimentos] == ["acao_aberta"]
    with pytest.raises(ValidationError, match="pendências"):
        svc.concluir_acompanhamento(
            nr_convenio=c.inst.nr_convenio, dados=_confirmar("integral"), db=db, usuario=c.titular
        )


def test_concluido_bloqueia_entrega_e_cancelamento_ate_reabrir(db):  # noqa: F811
    c = _preparar(db)
    entregas.registrar_entrega(
        nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.um), _item(c.dois, 1)), db=db, usuario=c.titular
    )
    cancelamento_unidade.cancelar_unidade_planejada(
        item_id=c.dois.id, dados=CancelamentoUnidadeCreate(motivo="Convenente desistiu"), db=db, usuario=c.titular
    )
    svc.concluir_acompanhamento(
        nr_convenio=c.inst.nr_convenio,
        dados=_confirmar("parcial", justificativa="Uma unidade do mamógrafo foi cancelada"),
        db=db,
        usuario=c.titular,
    )
    assert calcular_fase_acompanhamento(fatos_do_instrumento(db, c.inst)) == FaseAcompanhamento.concluido
    with pytest.raises(ConflictError, match="concluído"):
        entregas.registrar_entrega(
            nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois)), db=db, usuario=c.titular
        )
    with pytest.raises(ConflictError, match="concluído"):
        cancelamento_unidade.cancelar_unidade_planejada(
            item_id=c.dois.id, dados=CancelamentoUnidadeCreate(motivo="Convenente desistiu"), db=db, usuario=c.titular
        )
    svc.reabrir_acompanhamento(
        nr_convenio=c.inst.nr_convenio,
        dados=ReaberturaCreate(motivo="Cancelamento lançado por engano"),
        db=db,
        usuario=c.titular,
    )
    assert calcular_fase_acompanhamento(fatos_do_instrumento(db, c.inst)) != FaseAcompanhamento.concluido


def test_nao_conclui_duas_vezes_nem_reabre_o_que_nao_esta_concluido(db):  # noqa: F811
    c = _preparar(db)
    with pytest.raises(NotFoundError):
        svc.reabrir_acompanhamento(
            nr_convenio=c.inst.nr_convenio,
            dados=ReaberturaCreate(motivo="Sem conclusão ativa"),
            db=db,
            usuario=c.titular,
        )
    _cancelar_tudo(db, c)
    dados = _confirmar("sem_entregas", justificativa="Encerrado sem entregas")
    svc.concluir_acompanhamento(nr_convenio=c.inst.nr_convenio, dados=dados, db=db, usuario=c.titular)
    with pytest.raises(ConflictError, match="já está concluído"):
        svc.concluir_acompanhamento(nr_convenio=c.inst.nr_convenio, dados=dados, db=db, usuario=c.titular)


def test_data_futura_e_permissao(db):  # noqa: F811
    c = _preparar(db)
    _cancelar_tudo(db, c)
    amanha = ConclusaoCreate(
        resultado_confirmado="sem_entregas",
        data_conclusao=date.today() + timedelta(days=1),
        justificativa="Encerrado sem entregas",
    )
    with pytest.raises(ValidationError, match="futuro"):
        svc.concluir_acompanhamento(nr_convenio=c.inst.nr_convenio, dados=amanha, db=db, usuario=c.titular)
    dados = _confirmar("sem_entregas", justificativa="Encerrado sem entregas")
    for usuario in (c.outro, c.leitor):
        with pytest.raises(AuthorizationError):
            svc.concluir_acompanhamento(nr_convenio=c.inst.nr_convenio, dados=dados, db=db, usuario=usuario)


def test_evento_realizado_de_instalacao_inicia_o_pos_entrega(db):  # noqa: F811
    c = _preparar(db)
    entregas.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.um)), db=db, usuario=c.titular)
    assert calcular_fase_acompanhamento(fatos_do_instrumento(db, c.inst)) == FaseAcompanhamento.equipamento_entregue
    marco = db.scalar(select(MarcoCatalogo).where(MarcoCatalogo.codigo == "cronograma_instalacao_inicio"))
    previsto = EventoMarco(instrumento_id=c.inst.id, marco_id=marco.id, data_prevista=date.today())
    db.add(previsto)
    db.flush()
    assert calcular_fase_acompanhamento(fatos_do_instrumento(db, c.inst)) == FaseAcompanhamento.equipamento_entregue
    previsto.data_ocorrencia = date.today()
    db.flush()
    assert calcular_fase_acompanhamento(fatos_do_instrumento(db, c.inst)) == FaseAcompanhamento.pos_entrega


def test_concluido_trava_todas_as_edicoes_ate_reabrir(db):  # noqa: F811
    from app.schemas_documentos import DocumentoCreate
    from app.schemas_entregas import PrevisaoEntregaCreate
    from app.schemas_repasses import RepasseCreate
    from app.services import documentos_instrumento, monitoramento_acoes, monitoramento_cadastro, previsoes_entrega
    from app.services.repasses import registrar_repasse_manual

    c = _preparar(db)
    _entregar_tudo(db, c)
    svc.concluir_acompanhamento(nr_convenio=c.inst.nr_convenio, dados=_confirmar("integral"), db=db, usuario=c.titular)
    nr = c.inst.nr_convenio
    tentativas = [
        lambda: monitoramento_acoes.registrar_acao_monitorada(
            nr_convenio=nr,
            descricao="Ligar para o convenente",
            data_prevista=None,
            responsavel=None,
            db=db,
            usuario=c.titular,
        ),
        lambda: documentos_instrumento.registrar_documento(
            nr_convenio=nr,
            dados=DocumentoCreate(tipo="nota_fiscal", numero="1", data_documento=date.today()),
            db=db,
            usuario=c.titular,
        ),
        lambda: monitoramento_cadastro.atualizar_cadastro_instrumento(
            nr_convenio=nr, alteracoes_brutas={"nivel": "Alto"}, db=db, usuario=c.titular
        ),
        lambda: previsoes_entrega.definir_previsao_entrega(
            item_id=c.um.id,
            dados=PrevisaoEntregaCreate(data_prevista=date.today() + timedelta(days=30)),
            db=db,
            usuario=c.titular,
        ),
        lambda: registrar_repasse_manual(
            nr_convenio=nr, dados=RepasseCreate(tipo="integral"), db=db, usuario=c.titular
        ),
    ]
    for tentar in tentativas:
        with pytest.raises(ConflictError, match="Reabra"):
            tentar()
    svc.reabrir_acompanhamento(
        nr_convenio=nr, dados=ReaberturaCreate(motivo="Correção de lançamento"), db=db, usuario=c.titular
    )
    monitoramento_acoes.registrar_acao_monitorada(
        nr_convenio=nr,
        descricao="Ligar para o convenente",
        data_prevista=None,
        responsavel=None,
        db=db,
        usuario=c.titular,
    )


def test_evento_antigo_fase_concluido_tambem_trava_e_pode_ser_reaberto(db):  # noqa: F811
    c = _preparar(db)
    marco = db.execute(select(MarcoCatalogo).where(MarcoCatalogo.codigo == "fase_concluido")).scalar_one()
    db.add(
        EventoMarco(
            instrumento_id=c.inst.id,
            marco_id=marco.id,
            data_ocorrencia=date.today(),
            autor_id=c.titular.id,
        )
    )
    db.flush()
    avaliacao = svc.avaliar_conclusao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert avaliacao.conclusao is not None
    assert avaliacao.conclusao.data_conclusao == date.today()
    with pytest.raises(ConflictError, match="Reabra"):
        entregas.registrar_entrega(
            nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois)), db=db, usuario=c.titular
        )
    svc.reabrir_acompanhamento(
        nr_convenio=c.inst.nr_convenio,
        dados=ReaberturaCreate(motivo="Conclusão antiga lançada por engano"),
        db=db,
        usuario=c.titular,
    )
    assert calcular_fase_acompanhamento(fatos_do_instrumento(db, c.inst)) != FaseAcompanhamento.concluido
    assert svc.avaliar_conclusao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular).conclusao is None
