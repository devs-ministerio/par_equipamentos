"""Repasse integral/parcial e fase calculada do acompanhamento, contra PostgreSQL real."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import Convenio, InstrumentoEquipamento, MarcoCatalogo, RepasseInstrumento, User, UserRole
from app.domain_errors import AuthorizationError, NotFoundError, ValidationError
from app.schemas_repasses import RepasseCreate
from app.services import monitoramento_registro_eventos as eventos_servico
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
    assert situacao.repasse is not None
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
    atual = servico.obter_situacao_repasse(nr_convenio=instrumento.nr_convenio, db=db).repasse
    assert atual is not None and atual.origem == "manual"
    derivado = servico.derivar_repasse_da_fonte(instrumento=instrumento, db=db)
    assert derivado is not None and derivado.tipo == "parcial"


def test_fase_em_lote_bate_com_o_calculo_por_instrumento(db):
    """O cálculo em lote e o individual têm de concordar em todo instrumento do banco de teste."""
    from sqlalchemy import select

    from app.db.models import InstrumentoEquipamento
    from app.services.fase_acompanhamento import calcular_fase_acompanhamento
    from app.services.repasses import fases_calculadas_em_lote, fatos_do_instrumento

    instrumentos = list(db.scalars(select(InstrumentoEquipamento).limit(200)))
    em_lote = fases_calculadas_em_lote(db, instrumentos)
    for instrumento in instrumentos:
        assert em_lote[instrumento.id] == calcular_fase_acompanhamento(fatos_do_instrumento(db, instrumento))


def _lancar(db, instrumento, codigo, usuario, *, data=date(2026, 1, 10)):
    from sqlalchemy import select

    marco = db.execute(select(MarcoCatalogo).where(MarcoCatalogo.codigo == codigo)).scalar_one()
    return eventos_servico.registrar_evento_monitorado(
        nr_convenio=instrumento.nr_convenio,
        dados=eventos_servico.NovoEventoMonitorado(marco_id=marco.id, data_ocorrencia=data),
        db=db,
        usuario=usuario,
    )


def test_marco_do_cronograma_segue_a_fase_e_fabricacao_inicia_a_aquisicao(db, instrumento):
    admin = _usuario(db, UserRole.admin)
    fase = lambda: servico.obter_situacao_repasse(nr_convenio=instrumento.nr_convenio, db=db).fase_calculada  # noqa: E731

    # Antes do repasse: fabricação e pós-entrega recusadas; obra liberada.
    assert fase() == "Aguardando repasse"
    with pytest.raises(ValidationError, match="após o repasse"):
        _lancar(db, instrumento, "cronograma_inicio_fabricacao", admin)
    with pytest.raises(ValidationError, match="após a entrega"):
        _lancar(db, instrumento, "cronograma_instalacao_inicio", admin)
    _lancar(db, instrumento, "cronograma_obra_inicio", admin)

    # Com repasse, a fabricação realizada leva a "Em aquisição".
    servico.registrar_repasse_manual(
        nr_convenio=instrumento.nr_convenio, dados=RepasseCreate(tipo="integral"), db=db, usuario=admin
    )
    assert fase() == "Valor repassado"
    _lancar(db, instrumento, "cronograma_inicio_fabricacao", admin)
    assert fase() == "Em aquisição"
    assert servico.fases_calculadas_em_lote(db, [instrumento])[instrumento.id].value == "Em aquisição"
    with pytest.raises(ValidationError, match="após a entrega"):
        _lancar(db, instrumento, "cronograma_treinamento", admin)
