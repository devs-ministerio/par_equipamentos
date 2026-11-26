"""Paridade da extração de monitoramento com a prévia e os arquivos."""

from collections import Counter
from datetime import date
from io import BytesIO
from typing import Final

import pytest
from docx import Document
from openpyxl import load_workbook
from sqlalchemy import select

from app.db.models import (
    CancelamentoUnidadePlanejada,
    EventoMarco,
    InstrumentoEquipamento,
    ItemPlano,
    PropostaCandidata,
    User,
)
from app.repositories.monitoramento import obter_marco_por_codigo
from app.routers.relatorios import consultar_monitorados
from app.services.fatos_instrumento import carregar_etapas
from app.services.relatorios import FiltroRelatorio, montar_relatorio
from app.services.relatorios_monitorados import montar_relatorio_monitorado
from tests.test_relatorios_entregues_db import db, entregas  # noqa: F401

pytestmark = pytest.mark.db


@pytest.mark.parametrize("previsao", [None, date(2026, 4, 12)])
def test_entregas_com_inauguracao_ou_previsao(entregas, previsao):  # noqa: F811
    sessao, numero, marca = entregas
    inst = sessao.scalars(select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == numero)).one()
    item = sessao.scalars(select(ItemPlano).where(ItemPlano.instrumento_id == inst.id)).one()
    item.quantidade_planejada = 4
    marco = obter_marco_por_codigo(sessao, "cronograma_previsao_inauguracao")
    assert marco is not None
    sessao.add_all(
        [
            CancelamentoUnidadePlanejada(item_id=item.id, motivo="Uma unidade retirada do planejamento"),
            EventoMarco(
                instrumento_id=inst.id, marco_id=marco.id, data_ocorrencia=date(2026, 3, 20), data_prevista=previsao
            ),
        ]
    )
    sessao.flush()
    etapa = carregar_etapas(db=sessao, instrumentos=[inst])[0]
    assert etapa.conclusao_resultado is None
    assert etapa.modo_operacao == (None if previsao else "inaugurada")

    tipo: Final = "equipamentos_monitorados"
    nivel: Final = "completo"
    filtro = FiltroRelatorio(escopo="brasil", busca=marca)
    previa = consultar_monitorados(
        tipo,
        filtro,
        nivel,
        [],
        1,
        20,
        db=sessao,
        usuario=User(),
    )
    assert previa.total == 4
    situacao_entrega = "Entregue, a inaugurar" if previsao else "Em operação"
    ix = previa.colunas.index("Situação")
    assert Counter(linha[ix] for linha in previa.linhas) == {"Planejado": 1, situacao_entrega: 2, "Cancelado": 1}
    for formato in ("xlsx", "docx"):
        arquivo = montar_relatorio(db=sessao, formato=formato, nivel=nivel, tipo_relatorio=tipo, filtro=filtro)
        if formato == "xlsx":
            pasta = load_workbook(BytesIO(arquivo), read_only=True)
            registros = list(pasta["Registros"].values)
            pasta.close()
        else:
            doc = Document(BytesIO(arquivo))
            registros = [tuple(c.text for c in linha.cells) for linha in doc.tables[0].rows]
        assert registros[0] == previa.colunas
        assert [r[ix] for r in registros[1:]] == [r[ix] for r in previa.linhas]

    operacao = montar_relatorio_monitorado(
        db=sessao,
        tipo=tipo,
        nivel="simplificado",
        filtro=filtro,
        situacoes=("em_operacao",),
    )
    assert operacao.total == (0 if previsao else 2)
    concluidos = montar_relatorio_monitorado(
        db=sessao,
        tipo="instrumentos_monitorados",
        nivel="simplificado",
        filtro=FiltroRelatorio(escopo="brasil", busca=marca, situacao="Concluído"),
    )
    assert concluidos.total == 0


def test_previa_de_propostas_confere_com_word_e_excel(entregas):  # noqa: F811
    sessao, _, marca = entregas
    id_proposta = int(marca, 16)
    sessao.add(
        PropostaCandidata(
            id_proposta=id_proposta + 16777216,
            cnpj_ente_recebedor="00000000000002",
            nm_proponente=f"Parceria {marca}",
            ds_objeto="Aquisição de equipamento",
            situacao_proposta="Em análise",
            id_programa=1,
            nm_programa="Programa sintético",
            componente_batido="x",
            tem_parceria=True,
            cd_parceria=f"PAR{marca}",
        )
    )
    sessao.flush()
    filtro = FiltroRelatorio(escopo="brasil", busca=marca, etapa="propostas")
    tipo: Final = "instrumentos_repasse"
    nivel: Final = "simplificado"
    previa = consultar_monitorados(tipo, filtro, nivel, [], 1, 20, db=sessao, usuario=User())
    assert previa.total == 1
    assert previa.linhas == [(str(id_proposta), f"Entregues {marca} proposta")]

    xlsx = montar_relatorio(db=sessao, formato="xlsx", nivel=nivel, tipo_relatorio=tipo, filtro=filtro)
    pasta = load_workbook(BytesIO(xlsx), read_only=True)
    try:
        assert [str(linha[0]) for linha in list(pasta["Propostas"].values)[1:]] == [str(id_proposta)]
    finally:
        pasta.close()
    docx = montar_relatorio(db=sessao, formato="docx", nivel=nivel, tipo_relatorio=tipo, filtro=filtro)
    titulos = [p.text for p in Document(BytesIO(docx)).paragraphs if " -- Proposta " in p.text]
    assert titulos == [f"Entregues {marca} proposta -- Proposta {id_proposta}"]
