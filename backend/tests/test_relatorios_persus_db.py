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
def test_nota_do_valor_persus_i_so_aparece_quando_o_recorte_tem_persus_i():
    # Given: um município só com PERSUS I e outro só com convênio comum
    db = SessionLocal()
    try:
        com_persus = convenio("nota-persus", "PERSUS I", "Em operação", 9_000_000.0)
        com_persus.municipio = "Cidade Persus Teste"
        sem_persus = convenio("nota-conv", "Convênio", "Em execução", 1_000_000.0)
        sem_persus.municipio = "Cidade Comum Teste"
        db.add_all([com_persus, sem_persus])
        db.flush()

        def textos(municipio: str) -> list[str]:
            conteudo = montar_relatorio(
                db=db,
                formato="docx",
                nivel="simplificado",
                tipo_relatorio="instrumentos_repasse",
                filtro=FiltroRelatorio(escopo="municipio", uf="BA", municipio=municipio),
            )
            return [p.text for p in Document(BytesIO(conteudo)).paragraphs]

        # When / Then
        assert any("pode incluir obras" in t for t in textos("Cidade Persus Teste"))
        assert not any("pode incluir obras" in t for t in textos("Cidade Comum Teste"))
        assert not any(
            "PERSUS II" in t and "sem" not in t and "não têm valor" in t for t in textos("Cidade Comum Teste")
        )
    finally:
        db.rollback()
        db.close()


def test_tabela_de_equipamentos_soma_so_itens_com_valor():
    # Given: dois aceleradores, só um com valor (o outro, de PERSUS II, sem valor)
    from app.services.relatorios import _resumo_equipamentos

    colunas, linhas = _resumo_equipamentos({1: [("Acelerador Linear", 9_276_920.16)], 2: [("Acelerador Linear", None)]})
    # Then: quantidade conta os dois, valor é o do item que tem; a nota do relatório explica
    assert colunas == ["Equipamentos", "Quantidade", "Valor"]
    assert linhas == [["Acelerador Linear", 2, 9_276_920.16]]


def test_tabela_de_equipamentos_sem_nenhum_valor_fica_sem_valor():
    from app.services.relatorios import _resumo_equipamentos

    _, linhas = _resumo_equipamentos({1: [("Mamógrafo", None)]})
    assert linhas == [["Mamógrafo", 1, None]]


@pytest.mark.db
def test_nota_cita_equipamento_do_persus_ii_sem_valor():
    db = SessionLocal()
    try:
        db.add(convenio("nota-ps2", "PERSUS II", "Em contratação", 0.0))
        db.flush()
        conteudo = montar_relatorio(
            db=db,
            formato="docx",
            nivel="simplificado",
            tipo_relatorio="instrumentos_repasse",
            filtro=FiltroRelatorio(escopo="uf", uf="BA", tipo_contratacao="PERSUS II"),
        )
        textos = [p.text for p in Document(BytesIO(conteudo)).paragraphs]
        assert any("PERSUS II" in t and "não têm valor informado" in t for t in textos)
    finally:
        db.rollback()
        db.close()
