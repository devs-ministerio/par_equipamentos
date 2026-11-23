"""Fila de revisão: só gestão decide; a decisão é append-only, atualiza o item e é reaplicada pela projeção."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.classificacao_itens import chave_do_item
from app.db.base import engine
from app.db.models import (
    Convenio,
    DecisaoClassificacaoItem,
    EquipamentoCatalogo,
    ItemPlano,
    RenemItem,
    User,
    UserRole,
)
from app.domain_errors import AuthorizationError, ConflictError, ValidationError
from app.schemas_classificacao import DecisaoItemCreate
from app.services import classificacao_itens_plano as svc

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


def _usuario(db, role):
    u = User(
        name=f"{role.value} fila",
        email=f"pytest-fila-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=role,
    )
    db.add(u)
    db.flush()
    return u


def _cenario(db):
    familia = EquipamentoCatalogo(
        codigo=f"fam{uuid4().hex[:6]}", nome=f"Família {uuid4().hex[:6]}", controle_por_unidade=True
    )
    db.add(familia)
    db.flush()
    codigo = f"9{uuid4().int % 100000:05d}"
    db.add(RenemItem(codigo_item=codigo, nome="Equipamento teste", versao_lista="t", catalogo_id=familia.id))
    id_origem = uuid4().hex[:10]
    conv = Convenio(
        numero=f"FIL{uuid4().hex[:8]}",
        objeto="x",
        convenente_nome="x",
        siconv_raw={
            "itens_plano_aplicacao": [
                {
                    "ID_ITEM_PAD": id_origem,
                    "DESCRICAO_ITEM": "Tomógrafo sem canais",
                    "QTD_ITEM": "1",
                    "VALOR_TOTAL_ITEM": "100",
                }
            ]
        },
    )
    db.add(conv)
    db.flush()
    item = ItemPlano(
        convenio_id=conv.id,
        origem="siconv",
        id_origem=id_origem,
        descricao="Tomógrafo sem canais",
        situacao_classificacao="pendente",
        motivo_classificacao="verificar",
    )
    db.add(item)
    db.flush()
    return conv, item, familia, codigo, id_origem


def test_so_gestao_ve_e_decide(db):
    _, item, *_ = _cenario(db)
    colaborador = _usuario(db, UserRole.colaborador)
    with pytest.raises(AuthorizationError):
        svc.listar_fila(db=db, usuario=colaborador)
    with pytest.raises(AuthorizationError):
        svc.decidir(item_id=item.id, dados=DecisaoItemCreate(acao="confirmar"), db=db, usuario=colaborador)
    gestor = _usuario(db, UserRole.gestor)
    assert item.id in [i.id for i in svc.listar_fila(db=db, usuario=gestor)]


def test_corrigir_com_codigo_define_familia_controla_unidade_e_sai_da_fila(db):
    conv, item, familia, codigo, id_origem = _cenario(db)
    gestor = _usuario(db, UserRole.gestor)
    svc.decidir(
        item_id=item.id,
        dados=DecisaoItemCreate(
            acao="corrigir", tipo_lancamento="aquisicao", codigo_item=codigo, observacao="16 canais"
        ),
        db=db,
        usuario=gestor,
    )
    assert (item.tipo_lancamento, item.codigo_item, item.codigo_fonte) == ("aquisicao", codigo, "definido_pela_equipe")
    assert item.catalogo_id == familia.id and item.controla_unidade is True
    assert item.situacao_classificacao == "aplicada"
    assert item.id not in [i.id for i in svc.listar_fila(db=db, usuario=gestor)]
    vigente = db.execute(
        select(DecisaoClassificacaoItem).where(
            DecisaoClassificacaoItem.convenio_numero == conv.numero,
            DecisaoClassificacaoItem.chave_item == chave_do_item({"ID_ITEM_PAD": id_origem}),
            DecisaoClassificacaoItem.substituida_por_id.is_(None),
        )
    ).scalar_one()
    assert (vigente.origem, vigente.codigo_item, vigente.conta_unidade) == ("tecnico", codigo, True)


def test_segunda_decisao_substitui_a_primeira_sem_apagar(db):
    conv, item, _, codigo, id_origem = _cenario(db)
    gestor = _usuario(db, UserRole.admin)
    svc.decidir(item_id=item.id, dados=DecisaoItemCreate(acao="nao_equipamento"), db=db, usuario=gestor)
    svc.decidir(
        item_id=item.id,
        dados=DecisaoItemCreate(
            acao="corrigir", tipo_lancamento="aquisicao", codigo_item=codigo, situacao_esperada="aplicada"
        ),
        db=db,
        usuario=gestor,
    )
    todas = (
        db.execute(select(DecisaoClassificacaoItem).where(DecisaoClassificacaoItem.convenio_numero == conv.numero))
        .scalars()
        .all()
    )
    assert len(todas) == 2 and sum(d.substituida_por_id is None for d in todas) == 1


def test_codigo_desconhecido_multiplo_sem_correcao_e_rendimento_sem_unidade(db):
    _, item, *_ = _cenario(db)
    gestor = _usuario(db, UserRole.gestor)
    with pytest.raises(ValidationError):
        svc.decidir(
            item_id=item.id,
            dados=DecisaoItemCreate(acao="corrigir", tipo_lancamento="aquisicao", codigo_item="999999"),
            db=db,
            usuario=gestor,
        )
    item.tipo_lancamento = "multiplo"
    db.flush()
    with pytest.raises(ValidationError):
        svc.decidir(item_id=item.id, dados=DecisaoItemCreate(acao="confirmar"), db=db, usuario=gestor)
    svc.decidir(
        item_id=item.id,
        dados=DecisaoItemCreate(acao="corrigir", tipo_lancamento="rendimento_aplicacao"),
        db=db,
        usuario=gestor,
    )
    assert item.tipo_lancamento == "rendimento_aplicacao" and item.controla_unidade is False


def test_decisao_sobre_item_que_mudou_desde_a_leitura_e_recusada(db):
    _, item, *_ = _cenario(db)
    gestor = _usuario(db, UserRole.gestor)
    svc.decidir(item_id=item.id, dados=DecisaoItemCreate(acao="nao_equipamento"), db=db, usuario=gestor)
    # Decisão atrasada de quem ainda via o item como pendente.
    with pytest.raises(ConflictError, match="mudou"):
        svc.decidir(item_id=item.id, dados=DecisaoItemCreate(acao="confirmar"), db=db, usuario=gestor)
    assert db.get(type(item), item.id).tipo_lancamento == "nao_equipamento"


def test_decisao_em_instrumento_concluido_exige_reabrir(db):
    from datetime import date

    from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo

    conv, item, *_ = _cenario(db)
    gestor = _usuario(db, UserRole.gestor)
    instrumento = InstrumentoEquipamento(nr_convenio=conv.numero, nome_convenente="x", tipo_contratacao="Convênio")
    db.add(instrumento)
    db.flush()
    item.instrumento_id = instrumento.id
    marco = db.execute(select(MarcoCatalogo).where(MarcoCatalogo.codigo == "fase_concluido")).scalar_one()
    db.add(EventoMarco(instrumento_id=instrumento.id, marco_id=marco.id, data_ocorrencia=date.today()))
    db.flush()
    with pytest.raises(ConflictError, match="Reabra"):
        svc.decidir(item_id=item.id, dados=DecisaoItemCreate(acao="nao_equipamento"), db=db, usuario=gestor)


def test_confirmar_item_de_valor_alto_fora_das_familias_controla_unidade_pela_regra_de_valor(db):
    """Caso 949415: confirmar não pode gravar "não controla" e esconder a regra de R$ 300 mil por unidade."""
    conv, item, *_ = _cenario(db)
    conv.siconv_raw = {
        "itens_plano_aplicacao": [
            {
                "ID_ITEM_PAD": item.id_origem,
                "DESCRICAO_ITEM": "Sistema de Hemodinâmica",
                "QTD_ITEM": "2",
                "VALOR_TOTAL_ITEM": "6690500",
            }
        ]
    }
    item.descricao, item.quantidade_planejada, item.valor_total = "Sistema de Hemodinâmica", 2, 6690500
    item.tipo_lancamento = "aquisicao"
    db.flush()
    gestor = _usuario(db, UserRole.gestor)

    svc.decidir(item_id=item.id, dados=DecisaoItemCreate(acao="confirmar"), db=db, usuario=gestor)

    assert item.controla_unidade is True
    vigente = db.execute(
        select(DecisaoClassificacaoItem).where(
            DecisaoClassificacaoItem.convenio_numero == conv.numero,
            DecisaoClassificacaoItem.substituida_por_id.is_(None),
        )
    ).scalar_one()
    assert vigente.conta_unidade is None


def test_fila_nao_mostra_item_de_convenio_fora_de_escopo(db):
    conv, item, *_ = _cenario(db)
    gestor = _usuario(db, UserRole.gestor)
    assert item.id in [i.id for i in svc.listar_fila(db=db, usuario=gestor)]
    conv.fora_escopo_equipamentos = True
    db.flush()
    assert item.id not in [i.id for i in svc.listar_fila(db=db, usuario=gestor)]
