"""Equipamentos entregues (uma linha por unidade) e Situação única por origem, contra PostgreSQL real."""

from __future__ import annotations

from datetime import date
from io import BytesIO
from uuid import uuid4

import pytest
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import (
    Convenio,
    EntregaEquipamento,
    InstrumentoEquipamento,
    ItemPlano,
    PropostaCandidata,
    UnidadeEquipamento,
)
from app.schemas_relatorios_encerrados import FiltroEncerramento
from app.services.relatorios import FiltroRelatorio, montar_relatorio
from app.services.relatorios_entregues import previa_entregues

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


@pytest.fixture
def entregas(db):
    marca = uuid4().hex[:6]
    numero = f"PYE{marca}"
    conv = Convenio(numero=numero, objeto="x", convenente_nome="x", uf="SP", situacao="Em execução")
    db.add(conv)
    db.flush()
    inst = InstrumentoEquipamento(
        nr_convenio=numero,
        nome_convenente=f"Entregues {marca}",
        tipo_contratacao="Convênio",
        uf="SP",
        ano_instrumento=2025,
    )
    db.add(inst)
    db.flush()
    item = ItemPlano(
        convenio_id=conv.id,
        instrumento_id=inst.id,
        origem="manual",
        id_origem=f"manual:{numero}:1",
        descricao="Mamógrafo digital com tomossíntese",
        controla_unidade=True,
        quantidade_planejada=2,
    )
    db.add(item)
    db.flush()
    entrega = EntregaEquipamento(
        instrumento_id=inst.id, data_ocorrencia=date(2026, 3, 10), chave_idempotencia=f"pye-{marca}"
    )
    removida = EntregaEquipamento(
        instrumento_id=inst.id,
        data_ocorrencia=date(2026, 3, 11),
        chave_idempotencia=f"pye-x-{marca}",
        deletado_em=date(2026, 3, 12),
        motivo_exclusao="erro",
    )
    db.add_all([entrega, removida])
    db.flush()
    db.add_all(
        [
            UnidadeEquipamento(
                entrega_id=entrega.id, item_id=item.id, ordem=1, marca="Acme", modelo="M1", numero_serie="S1"
            ),
            UnidadeEquipamento(
                entrega_id=entrega.id, item_id=item.id, ordem=2, marca="Acme", modelo="M1", numero_serie="S2"
            ),
            UnidadeEquipamento(entrega_id=removida.id, item_id=item.id, ordem=3, marca="Acme", numero_serie="S3"),
        ]
    )
    db.add(
        PropostaCandidata(
            id_proposta=int(marca, 16),
            cd_parceria=f"P{marca}",
            cnpj_ente_recebedor="00000000000001",
            nm_proponente=f"Entregues {marca} proposta",
            situacao_proposta="Em análise",
            ds_objeto="Aquisição de equipamento",
            id_programa=1,
            nm_programa="Programa sintético",
            componente_batido="x",
        )
    )
    db.flush()
    return db, numero, marca


def test_uma_linha_por_unidade_ativa_e_filtra_por_busca(entregas):
    db, numero, marca = entregas
    previa = previa_entregues(db=db, filtro=FiltroEncerramento(busca=marca), pagina=1, limite=20)
    assert previa.total == 2
    assert [(i.ordem, i.numero_serie, i.data_entrega) for i in previa.itens] == [
        (1, "S1", date(2026, 3, 10)),
        (2, "S2", date(2026, 3, 10)),
    ]
    assert previa_entregues(db=db, filtro=FiltroEncerramento(busca=marca, uf=["RJ"]), pagina=1, limite=20).total == 0


def test_planilha_traz_as_unidades(entregas):
    db, _, marca = entregas
    filtro = FiltroRelatorio(escopo="uf", uf="SP", busca=marca, encerramento="entregues")
    pasta = load_workbook(
        BytesIO(
            montar_relatorio(
                db=db, formato="xlsx", nivel="simplificado", tipo_relatorio="instrumentos_repasse", filtro=filtro
            )
        )
    )
    colunas = [c.value for c in pasta["Equipamentos entregues"][1]]
    series = [
        r[colunas.index("Número de série")]
        for r in pasta["Equipamentos entregues"].iter_rows(min_row=2, values_only=True)
    ]
    assert series == ["S1", "S2"]


def test_situacao_de_proposta_esconde_instrumentos(entregas):
    db, numero, marca = entregas
    filtro = FiltroRelatorio(escopo="brasil", situacao="Em análise", situacao_origem="proposta", busca=marca)
    pasta = load_workbook(
        BytesIO(
            montar_relatorio(
                db=db, formato="xlsx", nivel="simplificado", tipo_relatorio="instrumentos_repasse", filtro=filtro
            )
        )
    )
    leitura = {r[0]: r[1] for r in pasta["Leitura"].iter_rows(min_row=2, values_only=True)}
    assert leitura["Contagem de convênios"] == 0
    assert leitura["Contagem de instrumentos monitorados"] == 0
    assert leitura["Situação da proposta"] == "Em análise"


def test_situacao_de_instrumento_esconde_propostas(entregas):
    db, numero, marca = entregas
    filtro = FiltroRelatorio(escopo="brasil", situacao="Em execução", situacao_origem="instrumento")
    pasta = load_workbook(
        BytesIO(
            montar_relatorio(
                db=db, formato="xlsx", nivel="simplificado", tipo_relatorio="instrumentos_repasse", filtro=filtro
            )
        )
    )
    leitura = {r[0]: r[1] for r in pasta["Leitura"].iter_rows(min_row=2, values_only=True)}
    assert leitura["Contagem de propostas"] == 0
    assert leitura["Contagem de convênios"] >= 1


def test_programa_e_busca_valem_tambem_para_propostas(entregas):
    db, _, marca = entregas
    base = {"escopo": "brasil", "situacao_origem": "proposta", "situacao": "Em análise"}
    por_programa = FiltroRelatorio(**base, programa="Programa sintético", busca=marca)
    outro_programa = FiltroRelatorio(**base, programa="Outro programa", busca=marca)
    from app.services.relatorios import _propostas

    assert len(_propostas(db, por_programa)) == 1
    assert _propostas(db, outro_programa) == []
    assert len(_propostas(db, FiltroRelatorio(**base, tipo_contratacao="FAF", busca=marca))) == 1
    assert _propostas(db, FiltroRelatorio(**base, tipo_contratacao="PRONON", busca=marca)) == []


def test_situacao_de_monitoramento_restringe_convenios_a_fase_e_esconde_propostas(entregas):
    db, numero, marca = entregas
    from app.services.relatorios import _convenios, _instrumentos, _instrumentos_do_recorte, _propostas

    base = FiltroRelatorio(escopo="brasil", busca=marca)
    fase = next(i.fase_atual for i in _instrumentos_do_recorte(db, base) if i.instrumento.nr_convenio == numero)

    da_fase = FiltroRelatorio(escopo="brasil", situacao=fase, situacao_origem="monitoramento", busca=marca)
    assert [i.instrumento.nr_convenio for i in _instrumentos(db, da_fase)] == [numero]
    assert [c.numero for c in _convenios(db, da_fase)] == [numero]
    assert _propostas(db, da_fase) == []

    outra_fase = FiltroRelatorio(
        escopo="brasil", situacao="Fase que não existe", situacao_origem="monitoramento", busca=marca
    )
    assert _instrumentos(db, outra_fase) == []
    assert _convenios(db, outra_fase) == []
