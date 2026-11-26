from datetime import date
from types import SimpleNamespace

from app.services.relatorios_contexto import contexto_do


def _instr(**c):
    base = dict(nr_convenio="1", cnes="2237601", municipio="PORTO ALEGRE", uf="RS", tipo_contratacao="Convênio",
                nome_convenente="HOSPITAL X", ano_instrumento=2018, tecnico_titular="Ana")
    base.update(c)
    return SimpleNamespace(**base)


def test_estabelecimento_do_cnes_tem_prioridade_e_municipio_e_capitalizado():
    c = contexto_do(_instr(), "Concluído", None, "Hospital de Clínicas de Porto Alegre")
    assert c.estabelecimento == "Hospital de Clínicas de Porto Alegre"
    assert c.municipio == "Porto Alegre"
    assert c.regiao == "Sul"


def test_sem_cnes_usa_o_convenente():
    c = contexto_do(_instr(cnes=None), "Concluído", None, None)
    assert c.estabelecimento == "HOSPITAL X"


def test_dados_do_convenio_quando_existe():
    convenio = SimpleNamespace(numero_processo="25000.1/2018-11", situacao="Em execução",
                               data_inicio_vigencia=date(2018, 3, 15), data_final_vigencia=date(2027, 3, 15))
    c = contexto_do(_instr(), "Aguardando repasse", convenio, None)
    assert (c.numero_processo, c.situacao_site, c.fim_vigencia) == ("25000.1/2018-11", "Em execução", date(2027, 3, 15))
    assert c.situacao_monitoramento == "Aguardando repasse"
    assert c.ano == 2018
