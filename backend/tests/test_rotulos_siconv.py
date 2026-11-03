from app.rotulos_siconv import rotulo_campo_siconv
from scripts.job_verificacao_siconv import resumo_campos


def test_campos_conhecidos_saem_em_portugues():
    assert rotulo_campo_siconv("NR_LICITACAO") == "Nº da licitação"
    assert rotulo_campo_siconv("UG_RESPONSAVEL") == "Unidade gestora responsável"
    assert rotulo_campo_siconv("VL_SALDO_CONTA") == "Saldo da conta"


def test_campo_novo_nunca_sai_cru():
    assert rotulo_campo_siconv("NR_ALGO_NOVO") == "Nº algo novo"
    assert rotulo_campo_siconv("DATA_PUBLICACAO_X") == "Data publicação x"
    assert rotulo_campo_siconv("OBSERVACAO_ESPECIAL") == "Observação especial"
    assert "_" not in rotulo_campo_siconv("QTD_ITENS_ENVIADOS")


def test_resumo_usa_rotulos_e_mantem_valores():
    texto = resumo_campos({"NR_LICITACAO": ("15", "015"), "VL_SALDO_CONTA": ("", "10,00")})
    assert texto == "Nº da licitação: 15 → 015; Saldo da conta: (vazio) → 10,00"
    assert "NR_LICITACAO" not in texto
