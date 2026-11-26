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


def test_formatar_processo_padroniza_nup_e_tira_espacos():
    from app.services.relatorios_modelo import formatar_processo

    assert formatar_processo("25000217837202583") == "25000.217837/2025-83"
    assert formatar_processo("25000151194202336   ") == "25000.151194/2023-36"
    assert formatar_processo("25000.226791/2011-98") == "25000.226791/2011-98"
    assert formatar_processo("12345") == "12345"
    assert formatar_processo("   ") is None
    assert formatar_processo(None) is None


def test_formatar_cnpj_padroniza_e_preserva_o_que_nao_e_cnpj():
    from app.services.relatorios_modelo import formatar_cnpj

    assert formatar_cnpj("87020517000120") == "87.020.517/0001-20"
    assert formatar_cnpj("87.020.517/0001-20 ") == "87.020.517/0001-20"
    assert formatar_cnpj("123") == "123"
    assert formatar_cnpj("") is None
    assert formatar_cnpj(None) is None


def test_exibir_instrumento_formata_so_o_nup():
    from app.services.relatorios_modelo import exibir_instrumento

    assert exibir_instrumento("25000185040202348") == "25000.185040/2023-48"
    assert exibir_instrumento("953726") == "953726"
    assert exibir_instrumento("PS1-358027") == "PS1-358027"
