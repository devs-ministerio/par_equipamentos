"""PERSUS no resumo do relatório: valor do acelerador e linha em contratação."""

from io import BytesIO

import pytest
from docx import Document
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador
from app.services.relatorios import (
    FiltroRelatorio,
    _carregar_equipamentos_por_convenio,
    _resumo_instrumentos_programas,
    montar_relatorio,
)
from scripts.preencher_quantidade_item_manual import preencher as preencher_quantidade
from scripts.preencher_valor_item_persus_i import preencher

PREFIXO = "__pytest_persus_"


def convenio(numero: str, tipo: str, situacao: str, valor: float | None) -> Convenio:
    return Convenio(
        numero=f"{PREFIXO}{numero}",
        convenente_nome="Hospital sintético",
        tipo_contratacao=tipo,
        situacao=situacao,
        valor_global=valor,
        uf="BA",
    )


def test_persus_ii_em_contratacao_mostra_o_rotulo_no_lugar_do_valor():
    # Given: dois PERSUS II ainda em contratação, sem valor
    itens = [convenio("a", "PERSUS II", "Em contratação", None), convenio("b", "PERSUS II", "Em contratação", None)]
    # When
    _, linhas = _resumo_instrumentos_programas(itens, [])
    # Then
    persus_ii = next(linha for linha in linhas if linha[0] == "PERSUS II")
    assert persus_ii[1:] == [2, "CONTRATAÇÃO"]


@pytest.mark.parametrize(
    "itens",
    [
        # um já saiu da contratação: o rótulo não vale para o grupo
        [convenio("a", "PERSUS II", "Em contratação", None), convenio("b", "PERSUS II", "Em execução", None)],
        # há valor informado: mostra o número, não o rótulo
        [convenio("a", "PERSUS II", "Em contratação", 1_000_000.0)],
    ],
)
def test_persus_ii_so_mostra_o_rotulo_quando_todos_estao_em_contratacao_e_sem_valor(itens):
    _, linhas = _resumo_instrumentos_programas(itens, [])
    persus_ii = next(linha for linha in linhas if linha[0] == "PERSUS II")
    assert persus_ii[2] != "CONTRATAÇÃO"


def test_outros_tipos_sem_valor_continuam_com_traco_e_nao_com_o_rotulo():
    _, linhas = _resumo_instrumentos_programas([convenio("a", "Convênio", "Em contratação", None)], [])
    assert next(linha for linha in linhas if linha[0] == "Convênios")[2] is None


@pytest.mark.db
def test_valor_do_acelerador_persus_i_vem_do_item_do_plano():
    # Given: um PERSUS I cujo item de equipamento já carrega o valor, e outro sem valor no item
    db = SessionLocal()
    try:
        catalogo = {c.codigo: c for c in db.scalars(select(EquipamentoCatalogo))}
        com_valor = convenio("com", "PERSUS I", "Em operação", 9_276_920.16)
        sem_valor = convenio("sem", "PERSUS I", "Em operação", 9_276_920.16)
        com_valor.siconv_raw = {
            "itens_plano_aplicacao": [{"DESCRICAO_ITEM": "Acelerador Linear", "VALOR_TOTAL_ITEM": "9276920,16"}]
        }
        sem_valor.siconv_raw = {"itens_plano_aplicacao": [{"DESCRICAO_ITEM": "Acelerador Linear"}]}
        db.add_all([com_valor, sem_valor])
        db.flush()
        for indice, alvo in enumerate([com_valor, sem_valor]):
            db.add(
                EquipamentoMarcador(
                    convenio_id=alvo.id,
                    equipamento_catalogo_id=catalogo["acelerador_linear"].id,
                    descricao_original="Acelerador Linear",
                    tipo_evidencia="item_orcamentario",
                    relacao="aquisicao",
                    confianca=75,
                    chave_evidencia=f"persus-item-{indice}",
                )
            )
        db.flush()
        # When
        resultado = _carregar_equipamentos_por_convenio(db, [com_valor, sem_valor])
        # Then: o relatório lê o item; sem valor no item continua sem valor (nada é inventado)
        assert resultado[com_valor.id] == [("Acelerador Linear", 9_276_920.16)]
        assert resultado[sem_valor.id] == [("Acelerador Linear", None)]
    finally:
        db.rollback()
        db.close()


@pytest.mark.db
def test_preenchimento_poe_o_valor_global_em_um_unico_item_sem_contar_em_dobro_e_e_idempotente():
    # Given: um PERSUS I com a mesma descrição repetida só na caixa, e o marcador visível em "Acelerador linear"
    db = SessionLocal()
    try:
        catalogo = {c.codigo: c for c in db.scalars(select(EquipamentoCatalogo))}
        persus = convenio("duplicado", "PERSUS I", "Em operação", 14_751_453.33)
        persus.siconv_raw = {
            "itens_plano_aplicacao": [{"DESCRICAO_ITEM": "Acelerador Linear"}, {"DESCRICAO_ITEM": "Acelerador linear"}]
        }
        outro_tipo = convenio("convenio", "Convênio", "Em execução", 1_000.0)
        outro_tipo.siconv_raw = {"itens_plano_aplicacao": [{"DESCRICAO_ITEM": "Mamógrafo"}]}
        db.add_all([persus, outro_tipo])
        db.flush()
        db.add(
            EquipamentoMarcador(
                convenio_id=persus.id,
                equipamento_catalogo_id=catalogo["acelerador_linear"].id,
                descricao_original="Acelerador linear",
                tipo_evidencia="item_orcamentario",
                relacao="aquisicao",
                confianca=75,
                chave_evidencia="persus-dup",
            )
        )
        db.flush()
        # When: simulação não grava; aplicar grava; repetir não muda nada
        simulado = preencher(db, aplicar=False)
        assert "VALOR_TOTAL_ITEM" not in str(persus.siconv_raw)
        aplicado = preencher(db, aplicar=True)
        db.flush()
        repetido = preencher(db, aplicar=True)
        # Then
        itens = {i["DESCRICAO_ITEM"]: i for i in persus.siconv_raw["itens_plano_aplicacao"]}
        assert itens["Acelerador linear"]["VALOR_TOTAL_ITEM"] == "14751453,33"
        assert "VALOR_TOTAL_ITEM" not in itens["Acelerador Linear"]
        assert "VALOR_TOTAL_ITEM" not in outro_tipo.siconv_raw["itens_plano_aplicacao"][0]
        assert simulado.alterados >= 1 and aplicado.alterados >= 1 and repetido.alterados == 0
        assert _carregar_equipamentos_por_convenio(db, [persus])[persus.id] == [("Acelerador Linear", 14_751_453.33)]
    finally:
        db.rollback()
        db.close()


@pytest.mark.db
def test_word_nao_traz_nota_de_valores_sob_o_resumo():
    # Given: recorte com PERSUS I
    db = SessionLocal()
    try:
        c = convenio("nota-persus", "PERSUS I", "Em operação", 9_000_000.0)
        c.municipio = "Cidade Persus Teste"
        db.add(c)
        db.flush()
        conteudo = montar_relatorio(
            db=db,
            formato="docx",
            nivel="simplificado",
            tipo_relatorio="instrumentos_repasse",
            filtro=FiltroRelatorio(escopo="municipio", uf="BA", municipio="Cidade Persus Teste"),
        )
        textos = [p.text for p in Document(BytesIO(conteudo)).paragraphs]
        # Then: sem o parágrafo de notas
        assert not any("somam apenas registros" in t or "pode incluir obras" in t for t in textos)
    finally:
        db.rollback()
        db.close()


@pytest.mark.db
def test_quantidade_um_vai_em_um_item_manual_por_instrumento_so_nos_tipos_da_regra_e_e_idempotente():
    # Given: PERSUS I com a descrição repetida só na caixa, e um Convênio com item manual
    db = SessionLocal()
    try:
        persus = convenio("qtd-persus", "PERSUS I", "Em operação", 1.0)
        persus.siconv_raw = {
            "itens_plano_aplicacao": [
                {"DESCRICAO_ITEM": "Acelerador Linear", "ORIGEM_ITEM": "carga_manual_inicial"},
                {"DESCRICAO_ITEM": "Acelerador linear", "ORIGEM_ITEM": "carga_manual_inicial"},
            ]
        }
        ja_com = convenio("qtd-ted", "TED", "Em execução", 1.0)
        ja_com.siconv_raw = {
            "itens_plano_aplicacao": [
                {"DESCRICAO_ITEM": "Mamógrafo", "ORIGEM_ITEM": "carga_manual_inicial", "QTD_ITEM": "2"}
            ]
        }
        convenio_comum = convenio("qtd-conv", "Convênio", "Em execução", 1.0)
        convenio_comum.siconv_raw = {
            "itens_plano_aplicacao": [{"DESCRICAO_ITEM": "Mamógrafo", "ORIGEM_ITEM": "carga_manual_inicial"}]
        }
        db.add_all([persus, ja_com, convenio_comum])
        db.flush()
        # When
        simulado = preencher_quantidade(db, aplicar=False)
        assert "QTD_ITEM" not in str(persus.siconv_raw)
        aplicado = preencher_quantidade(db, aplicar=True)
        db.flush()
        repetido = preencher_quantidade(db, aplicar=True)
        # Then: só o primeiro item manual recebe 1; quantidade existente e Convênio ficam como estavam
        itens = persus.siconv_raw["itens_plano_aplicacao"]
        assert [i.get("QTD_ITEM") for i in itens] == ["1", None]
        assert ja_com.siconv_raw["itens_plano_aplicacao"][0]["QTD_ITEM"] == "2"
        assert "QTD_ITEM" not in convenio_comum.siconv_raw["itens_plano_aplicacao"][0]
        assert simulado.alterados >= 1 and aplicado.alterados >= 1 and repetido.alterados == 0
        assert aplicado.fora_da_regra >= 1
    finally:
        db.rollback()
        db.close()
