"""Conclusão e previsões (D01): prévia filtrada por situação e arquivo, contra PostgreSQL real."""

from __future__ import annotations

from io import BytesIO
from uuid import uuid4

import pytest
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import InstrumentoEquipamento
from app.domain_errors import ValidationError
from app.services.relatorios import FiltroRelatorio, montar_relatorio
from app.services.relatorios_previsoes import previa_previsoes

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
def numero(db):
    numero = f"PYP{uuid4().hex[:6]}"
    db.add(
        InstrumentoEquipamento(
            nr_convenio=numero, nome_convenente="Hospital Previsão", tipo_contratacao="Convênio", uf="SP"
        )
    )
    db.flush()
    return numero


def _filtro(numero, **extra):
    return FiltroRelatorio(escopo="brasil", busca=numero, encerramento="previsoes", **extra)


def test_previa_lista_o_instrumento_e_conta_por_situacao(db, numero):
    previa = previa_previsoes(db=db, filtro=_filtro(numero), pagina=1, limite=20)
    assert [i.instrumento for i in previa.itens] == [numero]
    assert previa.itens[0].categoria == "nao_iniciado"
    assert {c.codigo: c.quantidade for c in previa.contagens}["nao_iniciado"] == 1


def test_filtro_por_situacao_exclui_outras_categorias(db, numero):
    vazio = previa_previsoes(db=db, filtro=_filtro(numero, situacao_conclusao="concluido"), pagina=1, limite=20)
    assert vazio.total == 0
    cheio = previa_previsoes(db=db, filtro=_filtro(numero, situacao_conclusao="nao_iniciado"), pagina=1, limite=20)
    assert cheio.total == 1


def test_situacao_desconhecida_e_rejeitada(db, numero):
    with pytest.raises(ValidationError):
        previa_previsoes(db=db, filtro=_filtro(numero, situacao_conclusao="inexistente"), pagina=1, limite=20)


def test_arquivo_xlsx_traz_resumo_e_linhas(db, numero):
    conteudo = montar_relatorio(
        db=db, formato="xlsx", nivel="simplificado", tipo_relatorio="instrumentos_repasse", filtro=_filtro(numero)
    )
    pasta = load_workbook(BytesIO(conteudo))
    assert pasta.sheetnames == ["Critérios", "Resumo por situação", "Conclusão e previsões"]
    assert pasta["Conclusão e previsões"].max_row == 2


def test_docx_gera_arquivo(db, numero):
    conteudo = montar_relatorio(
        db=db, formato="docx", nivel="simplificado", tipo_relatorio="instrumentos_repasse", filtro=_filtro(numero)
    )
    assert conteudo[:2] == b"PK"


def test_periodo_por_data_do_evento_nao_vale_em_previsoes(db, numero):
    with pytest.raises(ValidationError):
        montar_relatorio(
            db=db,
            formato="xlsx",
            nivel="simplificado",
            tipo_relatorio="instrumentos_repasse",
            filtro=_filtro(numero, periodo_por="data_do_evento"),
        )


def test_filtro_de_contratacao_reconhece_faf_e_pronon_nas_propostas(db):
    from app.db.models import PropostaCandidata
    from app.services.relatorios_recorte import _propostas

    marca = int(uuid4().int % 10**8) + 900_000_000
    for deslocamento, programa, metas in (
        (0, "ATENÇÃO ESPECIALIZADA EM SAÚDE", {"d": "Normas na modalidade Fundo a Fundo"}),
        (1, "Pronon - Serviços médico-assistenciais", {}),
        (2, "ATENÇÃO ESPECIALIZADA EM SAÚDE", {}),
    ):
        db.add(
            PropostaCandidata(
                id_proposta=marca + deslocamento,
                cnpj_ente_recebedor="12345678000190",
                nm_proponente=f"Proponente D03 {marca}",
                ds_objeto="x",
                nm_programa=programa,
                id_programa=1,
                componente_batido="x",
                metas_resumo=metas,
                uf="SP",
            )
        )
    db.flush()

    def ids(tipo):
        filtro = FiltroRelatorio(escopo="brasil", tipo_contratacao=tipo, busca=f"D03 {marca}")
        return sorted(p.id_proposta - marca for p in _propostas(db, filtro))

    assert ids("FAF") == [0, 2]
    assert ids("PRONON") == [1]
    assert ids("TED") == []
