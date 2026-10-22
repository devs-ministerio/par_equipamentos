"""Resposta incompleta não é coleção vazia: fronteira HTTP real do cliente."""

import json

import pytest
from requests import Response, Session

from app.pipeline import transferegov_parcerias as api
from app.pipeline.contratos_externos import RespostaExternaInvalidaError
from scripts.levantamento_convenios_oncologia import _paginar_transferegov

CONSULTAS = [
    "buscar_parcerias_por_proposta",
    "buscar_metas_por_proposta",
    "buscar_metas_por_proposta_dto",
    "buscar_itens_por_etapa",
    "buscar_cronograma_por_proposta",
    "buscar_distribuicao_recurso_por_proposta",
    "buscar_analises_por_proposta",
    "buscar_empenhos_por_parceria",
    "buscar_documentos_habeis_por_parceria",
    "buscar_ordens_pagamento_por_documento",
    "buscar_contas_por_parceria",
    "buscar_extrato_por_conta",
]


def resposta_json(corpo):
    resposta = Response()
    resposta.status_code = 200
    resposta._content = json.dumps(corpo).encode()
    return resposta


@pytest.mark.parametrize("consulta", CONSULTAS)
@pytest.mark.parametrize("corpo", [{}, {"total_pages": 1}, {"data": []}])
def test_colecao_omitida_nao_vira_vazia_em_nenhum_consumidor(monkeypatch, consulta, corpo):
    # Arrange
    with Session() as sessao:
        chamadas = []

        def get(url, *, params, timeout):
            chamadas.append(params)
            return resposta_json(corpo)

        monkeypatch.setattr(sessao, "get", get)
        # Act / Assert
        with pytest.raises((ValueError, RespostaExternaInvalidaError)):
            getattr(api, consulta)(sessao, 42)
        assert len(chamadas) == 1 and chamadas[0]["pagina"] == 1


@pytest.mark.parametrize("consulta", CONSULTAS)
def test_colecao_oficial_explicitamente_vazia_continua_valida(monkeypatch, consulta):
    # Arrange
    with Session() as sessao:
        monkeypatch.setattr(sessao, "get", lambda *a, **k: resposta_json({"data": [], "total_pages": 0}))
        # Act
        registros = getattr(api, consulta)(sessao, 42)
        # Assert
        assert registros == []


def test_descoberta_de_programas_reutiliza_paginacao_integral_confirmada(monkeypatch):
    # Arrange: página curta ainda exige ler a segunda página declarada.
    chamadas = []
    with Session() as sessao:

        def get(url, *, params, timeout):
            chamadas.append(params["pagina"])
            return resposta_json({"data": [{"id_programa": params["pagina"]}], "total_pages": 2})

        monkeypatch.setattr(sessao, "get", get)
        # Act
        programas = _paginar_transferegov("programa", {}, sessao)
        # Assert
        assert chamadas == [1, 2] and [p["id_programa"] for p in programas] == [1, 2]


@pytest.mark.parametrize("defeito", ["omitida", "total_mudou", "ultima_vazia"])
def test_falha_na_ultima_pagina_nao_devolve_colecao_parcial(monkeypatch, defeito):
    # Arrange
    with Session() as sessao:

        def get(url, *, params, timeout):
            if params["pagina"] == 1:
                return resposta_json({"data": [{"id_proposta_cronograma_item": 7}], "total_pages": 2})
            return resposta_json(
                {} if defeito == "omitida" else {"data": [], "total_pages": 3 if defeito == "total_mudou" else 2}
            )

        monkeypatch.setattr(sessao, "get", get)
        # Act / Assert
        with pytest.raises(ValueError, match="Envelope|Paginação|Página"):
            api.buscar_cronograma_por_proposta(sessao, 42)
