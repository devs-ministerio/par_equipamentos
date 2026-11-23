from scripts.coletar_recaptura_legado import completar_dim_convenio

PROPOSTA = {"NR_PROPOSTA": "23343/2026", "OBJETO_PROPOSTA": "AQUISIÇÃO DE EQUIPAMENTO"}


def test_completa_numero_e_objeto_vazios_e_marca_a_origem():
    portal: dict = {"dimConvenio": {"codigo": "7AAFSX", "numero": "", "objeto": ""}, "situacao": "x"}
    dim: dict = completar_dim_convenio(portal, PROPOSTA)["dimConvenio"]
    assert (dim["numero"], dim["objeto"]) == ("23343/2026", "AQUISIÇÃO DE EQUIPAMENTO")
    assert dim["complementado_do_siconv"] == ["numero", "objeto"]
    assert portal["dimConvenio"]["numero"] == ""  # não altera a entrada


def test_nao_sobrescreve_o_que_o_portal_trouxe():
    portal = {"dimConvenio": {"codigo": "1", "numero": "9/2026", "objeto": "Objeto do Portal"}}
    assert completar_dim_convenio(portal, PROPOSTA) is portal


def test_completa_so_o_campo_vazio():
    portal = {"dimConvenio": {"codigo": "1", "numero": "9/2026", "objeto": ""}}
    dim: dict = completar_dim_convenio(portal, PROPOSTA)["dimConvenio"]
    assert dim["numero"] == "9/2026" and dim["complementado_do_siconv"] == ["objeto"]


def test_sem_dado_no_siconv_mantem_vazio_e_o_contrato_recusa():
    portal = {"dimConvenio": {"codigo": "1", "numero": "", "objeto": ""}}
    assert completar_dim_convenio(portal, {}) is portal
