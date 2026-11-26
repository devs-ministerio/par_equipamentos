from datetime import date

from app.services.relatorios_filtro import FiltroRelatorio
from app.services.relatorios_modelo import (
    cabecalho,
    descrever_filtros,
    nome_arquivo,
    quebra_por,
    slug_recorte,
)


def test_slug_do_recorte():
    assert slug_recorte(FiltroRelatorio(escopo="brasil")) == "BRASIL"
    assert slug_recorte(FiltroRelatorio(escopo="uf", uf="mg")) == "MG"
    assert slug_recorte(FiltroRelatorio(escopo="regiao", regiao="Sudeste")) == "regiao-sudeste"
    assert slug_recorte(FiltroRelatorio(escopo="municipio", municipio="São Paulo", uf="SP")) == "municipio-sao-paulo-SP"
    assert slug_recorte(FiltroRelatorio(escopo="cnes", cnes="2237601")) == "cnes-2237601"


def test_nome_do_arquivo_leva_recorte_e_nivel():
    f = FiltroRelatorio(escopo="uf", uf="MG")
    assert nome_arquivo("equipamentos", f, "simplificado", "xlsx") == "relatorio-equipamentos-MG-simplificado.xlsx"


def test_filtros_padrao_de_equipamentos():
    assert descrever_filtros(FiltroRelatorio(escopo="brasil")) == "Todos os Equipamentos em Oncologia"
    assert descrever_filtros(FiltroRelatorio(escopo="brasil", equipamento="Mamógrafo", tipo_contratacao="PERSUS I")) == (
        "Mamógrafo · PERSUS I"
    )
    assert descrever_filtros(
        FiltroRelatorio(escopo="brasil"), contratacoes=("TED", "Convênio", None, "FAF", "PERSUS I", "FAF")
    ) == "Todos os Equipamentos em Oncologia · Convênio, FAF, PERSUS I, TED"
    assert descrever_filtros(
        FiltroRelatorio(escopo="brasil", tipo_contratacao="TED"), contratacoes=("FAF", "TED")
    ) == "Todos os Equipamentos em Oncologia · TED"


def test_cabecalho_tem_quatro_campos():
    linhas = cabecalho(FiltroRelatorio(escopo="uf", uf="MG"), referencia=date(2026, 11, 26), fonte="SISGEO", filtros="x")
    assert linhas == (
        ("Recorte", "UF MG"),
        ("Filtros", "x"),
        ("Referência", "26/11/2026"),
        ("Fonte", "SISGEO"),
    )


def test_quebra_conta_e_soma_total():
    tabela = quebra_por("Por UF", "UF", ["MG", "MG", "SP"])
    assert tabela.colunas == ("UF", "Total", "%")
    assert tabela.linhas == [("MG", 2, "67%"), ("SP", 1, "33%"), ("Total", 3, "100%")]
