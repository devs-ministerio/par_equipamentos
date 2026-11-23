"""Cadastro do Radar: Portal completado pelo SICONV ou só SICONV (sem banco, sem rede)."""

import pytest

from app.domain_errors import ConflictError
from app.schemas_portal_legado import PortalLegadoCapturado
from scripts.coletar_recaptura_legado import compor_portal

CONVENIO = {
    "NR_CONVENIO": "7AAFRI",
    "ANO": "2026",
    "DIA_PUBL_CONV": "23/09/2026",
    "DIA_INIC_VIGENC_CONV": "24/09/2026",
    "DIA_FIM_VIGENC_CONV": "",
    "NR_PROCESSO": "25000101394202691",
}
PROPOSTA = {
    "NR_PROPOSTA": "30483/2025",
    "OBJETO_PROPOSTA": "AQUISIÇÃO DE EQUIPAMENTO",
    "NM_PROPONENTE": "INSTITUTO UNIDADE RADIOLOGICA",
    "IDENTIF_PROPONENTE": "40596265000119",
    "MUNIC_PROPONENTE": "CIANORTE",
    "UF_PROPONENTE": "PR",
    "COD_MUNIC_IBGE": "4105508",
}


def _portal(**dim):
    return {
        "dimConvenio": {"codigo": "7AAFRI", "numero": "", "objeto": "", **dim},
        "convenente": {"nome": "Nome do Portal", "cnpjFormatado": "40.596.265/0001-19", "tipo": "Privada"},
        "municipioConvenente": {"nomeIBGE": "Cianorte", "uf": {"nome": "PR"}},
        "dataPublicacao": "2026-09-23",
        "situacao": "Em execução",
    }


def test_sem_portal_monta_tudo_do_siconv_e_o_contrato_aceita():
    composto = compor_portal(None, CONVENIO, PROPOSTA)
    validado = PortalLegadoCapturado.model_validate(composto)
    assert validado.dimConvenio.numero == "30483/2026"  # sequencial da proposta com o ano do convênio
    assert validado.convenente.cnpjFormatado == "40596265000119"
    assert (validado.municipioConvenente.nomeIBGE, validado.municipioConvenente.codigoIBGE) == ("CIANORTE", "4105508")
    assert validado.dataPublicacao.isoformat() == "2026-09-23"
    assert validado.dataFinalVigencia is None  # vazio no SICONV continua ausente
    assert composto["origem_cadastro"] == "siconv"


def test_portal_vazio_e_completado_e_a_origem_dos_campos_fica_registrada():
    composto = compor_portal(_portal(), CONVENIO, PROPOSTA)
    assert composto["dimConvenio"]["numero"] == "30483/2026"
    assert composto["dimConvenio"]["objeto"] == "AQUISIÇÃO DE EQUIPAMENTO"
    assert composto["origem_cadastro"] == "portal"
    assert set(composto["complementado_do_siconv"]) >= {"dimConvenio.numero", "dimConvenio.objeto", "numeroProcesso"}
    PortalLegadoCapturado.model_validate(composto)


def test_portal_mantem_o_que_trouxe_exceto_o_nome_da_instituicao():
    composto = compor_portal(_portal(numero="9/2026", objeto="Objeto do Portal"), CONVENIO, PROPOSTA)
    assert composto["dimConvenio"]["numero"] == "9/2026"
    assert composto["dimConvenio"]["objeto"] == "Objeto do Portal"
    assert composto["municipioConvenente"]["nomeIBGE"] == "Cianorte"
    assert composto["convenente"]["nome"] == "INSTITUTO UNIDADE RADIOLOGICA"  # decisão: nome do SICONV
    assert composto["convenente"]["tipo"] == "Privada"
    assert composto["situacao"] == "Em execução"


def test_cnpj_divergente_entre_portal_e_siconv_recusa():
    portal = _portal()
    portal["convenente"]["cnpjFormatado"] = "11.222.333/0001-81"
    with pytest.raises(ConflictError, match="CNPJ"):
        compor_portal(portal, CONVENIO, PROPOSTA)


def test_sem_ano_do_convenio_usa_o_ano_da_proposta():
    composto = compor_portal(None, {**CONVENIO, "ANO": ""}, PROPOSTA)
    assert composto["dimConvenio"]["numero"] == "30483/2025"


def test_nao_altera_as_entradas():
    portal = _portal()
    compor_portal(portal, CONVENIO, PROPOSTA)
    assert portal["dimConvenio"]["numero"] == ""
