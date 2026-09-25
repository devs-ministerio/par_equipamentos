from scripts.complementar_persus_monitoramento import ARQUIVO_PADRAO, ler_controle
from scripts.reconstruir_fases_monitoramento import fase_para_evento


def test_fase_para_evento_prefere_vinculo_ja_persistido():
    assert fase_para_evento("cronograma_entrega", "fase_equipamento_entregue") == "fase_equipamento_entregue"


def test_fase_para_evento_inferre_somente_marcos_inequivocos():
    assert fase_para_evento("cronograma_comissionamento", None) == "fase_comissionamento"
    assert fase_para_evento("cronograma_trp", None) is None


def test_controle_usa_cnes_unico_quando_unidade_tem_alias_entre_abas():
    registro = next(item for item in ler_controle(ARQUIVO_PADRAO) if item.cnes_informado == "2576341")

    assert registro.datas_equipamento["cronograma_comissionamento"].isoformat() == "2025-10-10"
    assert registro.nup == "25000.066211/2022-50"
