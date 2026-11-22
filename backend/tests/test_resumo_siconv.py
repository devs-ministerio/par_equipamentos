from app.services.espelho_diff import DiffLista
from scripts.job_verificacao_siconv import ResultadoConvenio, resumo_convenio


def test_resumo_em_linhas_com_campos_alterados_e_registros_novos():
    resultado = ResultadoConvenio(
        mudancas={"SIT_CONVENIO": ("Em execução", "Concluído")},
        filhas={
            "pagamentos": DiffLista(
                adicionados=[{"NR_MOV_FIN": "9", "NR_DL": "970", "VL": ""}],
                alterados=[("7", {"VALOR_EMPENHO": ("10", "20")})],
            )
        },
    )
    linhas = resumo_convenio(resultado).split("\n")
    assert linhas[0] == "Situação do convênio: Em execução → Concluído"
    assert "Pagamentos: 1 novo(s), 1 alterado(s)" in linhas
    assert "• Registro 7: Valor do empenho: 10 → 20" in linhas
    assert "• Novo registro: Nº mov fin: 9; Nº do documento de liquidação: 970" in linhas


def test_resumo_limita_registros_novos_detalhados():
    novos = [{"NR_MOV_FIN": str(i)} for i in range(8)]
    texto = resumo_convenio(ResultadoConvenio(filhas={"pagamentos": DiffLista(adicionados=novos)}))
    assert texto.count("• Novo registro") == 5
    assert "• e mais 3 novo(s)" in texto
