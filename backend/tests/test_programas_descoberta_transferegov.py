"""Escopo exato da nova API: apenas HTTP é substituído nos testes."""

import json

import pytest
from requests import Response, Session

from app.catalogo_componentes import ALIASES_COMPONENTES, COMPONENTES_ALVO
from scripts.job_descoberta_transferegov import _propostas_com_identificador, _resolver_programas_alvo


def consultar(monkeypatch, programas):
    def get(self, url, *, params, timeout):
        assert url.endswith("/programa") and params["pagina"] == 1
        resposta = Response()
        resposta.status_code = 200
        resposta._content = json.dumps({"data": programas, "total_pages": 1}).encode()
        return resposta

    monkeypatch.setattr(Session, "get", get)
    with Session() as sessao:
        return _resolver_programas_alvo(sessao)


@pytest.mark.parametrize("orgao", ["MCTI", "MEC", None, "", "Falso MS"])
def test_nome_de_componente_nao_substitui_prova_do_ministerio_da_saude(monkeypatch, orgao):
    # Arrange
    programas = [{"id_programa": 42, "nm_programa": COMPONENTES_ALVO[0], "sg_ente_superior": orgao}]
    # Act / Assert
    assert consultar(monkeypatch, programas) == {}


def test_nome_parecido_com_formacao_nao_e_componente_prioritario(monkeypatch):
    # Arrange: similaridade elevada, mas não é o nome integral do catálogo.
    programas = [
        {"id_programa": 42, "nm_programa": COMPONENTES_ALVO[0] + " - CURSO DE CAPACITAÇÃO", "sg_ente_superior": "MS"}
    ]
    # Act / Assert
    assert consultar(monkeypatch, programas) == {}


@pytest.mark.parametrize("nome,componente", [(n, n) for n in COMPONENTES_ALVO] + list(ALIASES_COMPONENTES.items()))
def test_nomes_integrais_e_aliases_curados_do_ms_continuam_elegiveis(monkeypatch, nome, componente):
    # Arrange
    programa = {"id_programa": 42, "nm_programa": nome, "sg_ente_superior": "MS", "campo_fonte": "evidência"}
    # Act
    resultado = consultar(monkeypatch, [programa])
    # Assert
    assert set(resultado) == {42} and resultado[42]["componente_alvo"] == componente
    assert resultado[42]["registro"]["campo_fonte"] == "evidência"


def test_mesmo_programa_com_orgao_divergente_aborta_sem_escolher_primeiro(monkeypatch):
    # Arrange
    programa = {"id_programa": 42, "nm_programa": COMPONENTES_ALVO[0], "sg_ente_superior": "MS"}
    # Act / Assert
    with pytest.raises(ValueError, match="duplicad"):
        consultar(monkeypatch, [programa, {**programa, "sg_ente_superior": "MEC"}])


def test_repeticao_identica_de_programa_nao_duplica_escopo(monkeypatch):
    # Arrange
    programa = {"id_programa": 42, "nm_programa": COMPONENTES_ALVO[0], "sg_ente_superior": "MS"}
    # Act
    resultado = consultar(monkeypatch, [programa, programa])
    # Assert
    assert list(resultado) == [42]


@pytest.mark.parametrize("identificador", [True, 0, -1, "42"])
def test_identidade_invalida_nao_entra_por_coercao(monkeypatch, identificador):
    # Arrange
    programa = {"id_programa": identificador, "nm_programa": COMPONENTES_ALVO[0], "sg_ente_superior": "MS"}
    # Act / Assert
    with pytest.raises(ValueError):
        consultar(monkeypatch, [programa])


@pytest.mark.parametrize("identificador", [True, False, 0, -1, "42", None])
def test_proposta_com_identidade_invalida_aborta_sem_descarte_silencioso(identificador):
    with pytest.raises(ValueError):
        _propostas_com_identificador([{"id_proposta": 1}, {"id_proposta": identificador}])


def test_proposta_sem_identidade_aborta():
    with pytest.raises(ValueError):
        _propostas_com_identificador([{}])


def test_proposta_duplicada_divergente_aborta():
    with pytest.raises(ValueError, match="duplicad"):
        _propostas_com_identificador([{"id_proposta": 1, "valor": 100}, {"id_proposta": 1, "valor": 200}])


def test_proposta_identica_repetida_nao_duplica_e_preserva_payload():
    proposta = {"id_proposta": 1, "campo_extra": "evidência da fonte"}
    assert _propostas_com_identificador([proposta, proposta.copy()]) == [(proposta, 1)]
