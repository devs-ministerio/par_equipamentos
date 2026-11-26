from datetime import date

from app.schemas_monitoramento import EtapasInstrumentoRead
from app.services.relatorios_inauguracao import inauguracao_da_linha, status_do_instrumento


def _etapa(**campos):
    return EtapasInstrumentoRead(nr_convenio="1", **campos)


def test_em_operacao_realizada_mostra_data_da_inauguracao():
    e = _etapa(inauguracao=date(2026, 2, 20), modo_operacao="inaugurada")
    assert inauguracao_da_linha(e, "em_operacao") == (date(2026, 2, 20), "Realizada")


def test_dispensada_e_pela_entrega_ficam_sem_data():
    assert inauguracao_da_linha(_etapa(modo_operacao="dispensada"), "em_operacao") == (None, "Dispensada")
    assert inauguracao_da_linha(_etapa(modo_operacao="pela_entrega"), "em_operacao") == (None, "Pela entrega")


def test_entregue_a_inaugurar_mostra_previsao():
    e = _etapa(previsao_inauguracao=date(2026, 12, 15))
    assert inauguracao_da_linha(e, "entregue") == (date(2026, 12, 15), "Prevista")


def test_sem_previsao_fica_vazio():
    assert inauguracao_da_linha(_etapa(), "entregue") == (None, None)


def test_planejado_so_mostra_previsao_e_cancelado_nada():
    e = _etapa(inauguracao=date(2026, 2, 20), previsao_inauguracao=date(2027, 1, 10), modo_operacao="inaugurada")
    assert inauguracao_da_linha(e, "planejado") == (date(2027, 1, 10), "Prevista")
    assert inauguracao_da_linha(e, "cancelado") == (None, None)


def test_status_do_instrumento_segue_a_mesma_regra():
    assert status_do_instrumento(_etapa(inauguracao=date(2026, 2, 20), modo_operacao="inaugurada")) == "Realizada"
    assert status_do_instrumento(_etapa(previsao_inauguracao=date(2026, 12, 15))) == "Prevista"
    assert status_do_instrumento(_etapa()) is None
