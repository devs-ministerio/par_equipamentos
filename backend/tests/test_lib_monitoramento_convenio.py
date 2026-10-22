"""Item manual do plano: o valor do equipamento é gravado no próprio item, sem sobrescrever."""

from app.db.models import Convenio
from scripts.lib_monitoramento_convenio import adicionar_item_manual_inicial, valor_item_em_texto


def convenio_vazio(raw=None) -> Convenio:
    return Convenio(numero="x", convenente_nome="Hospital", siconv_raw=raw)


def itens(convenio: Convenio) -> list[dict]:
    assert convenio.siconv_raw is not None
    return convenio.siconv_raw["itens_plano_aplicacao"]


def test_valor_vai_no_item_no_formato_do_siconv_com_origem():
    # Given / When
    c = convenio_vazio()
    adicionar_item_manual_inicial(c, "Acelerador Linear", "planilha", valor_total=9_276_920.16)
    # Then
    item = itens(c)[0]
    assert item["VALOR_TOTAL_ITEM"] == "9276920,16"
    assert "PERSUS I" in item["VALOR_ITEM_ORIGEM"]
    assert item["ORIGEM_ITEM"] == "carga_manual_inicial"


def test_sem_valor_o_item_nasce_sem_o_campo():
    c = convenio_vazio()
    adicionar_item_manual_inicial(c, "Acelerador Linear", "planilha")
    assert "VALOR_TOTAL_ITEM" not in itens(c)[0]


def test_item_existente_recebe_o_valor_so_se_ainda_nao_tiver_e_nunca_duplica():
    # Given: item já existente, uma vez sem valor e outra com valor
    c = convenio_vazio({"itens_plano_aplicacao": [{"DESCRICAO_ITEM": "Acelerador Linear"}]})
    # When
    adicionar_item_manual_inicial(c, "Acelerador Linear", "planilha", valor_total=100)
    adicionar_item_manual_inicial(c, "Acelerador Linear", "planilha", valor_total=999)
    # Then
    assert len(itens(c)) == 1
    assert itens(c)[0]["VALOR_TOTAL_ITEM"] == "100,00"


def test_descricao_vazia_nao_cria_item_e_valor_arredonda_a_dois_decimais():
    c = convenio_vazio()
    adicionar_item_manual_inicial(c, "  ", "planilha", valor_total=10)
    assert c.siconv_raw is None
    assert valor_item_em_texto(5928266.989) == "5928266,99"
