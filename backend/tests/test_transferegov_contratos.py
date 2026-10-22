import json
from typing import cast

import pytest
from pydantic import ValidationError
from requests import Response, Session

from app.pipeline import transferegov_parcerias
from app.pipeline.transferegov_parcerias import _validar_registros_do_endpoint


def test_proposta_exige_identificador_e_preserva_campos_extras():
    resultado = _validar_registros_do_endpoint(
        "proposta", [{"id_proposta": 42, "ds_objeto": "Equipamento", "campo_novo": "evidência"}]
    )
    assert resultado[0]["id_proposta"] == 42
    assert resultado[0]["campo_novo"] == "evidência"


@pytest.mark.parametrize("identidade", [True, False, 0, -1, "42", None])
def test_cliente_nao_converte_identidade_invalida_antes_do_job(identidade):
    with pytest.raises(ValidationError):
        _validar_registros_do_endpoint("proposta", [{"id_proposta": identidade}])


def test_parceria_sem_identificador_e_rejeitada_na_borda():
    with pytest.raises(ValidationError):
        _validar_registros_do_endpoint("parceria", [{"cd_parceria": "20250001"}])


def test_documento_habil_exige_id_usado_para_encadear_ordens_de_pagamento():
    with pytest.raises(ValidationError):
        _validar_registros_do_endpoint("documento-habil", [{"numero": "2025NE1"}])


def test_recurso_financeiro_preserva_payload_ainda_nao_mapeado():
    resultado = _validar_registros_do_endpoint("empenho-parceria", [{"id_empenho_parceria": 7, "vl_empenhado": 10}])
    assert resultado[0]["vl_empenhado"] == 10


def test_porta_dto_de_metas_expoe_modelo_tipado(monkeypatch):
    monkeypatch.setattr(
        transferegov_parcerias,
        "_buscar_paginado",
        lambda *_args, **_kwargs: [{"etapas_proposta": [{"id_etapa_proposta": 7}]}],
    )

    metas = transferegov_parcerias.buscar_metas_por_proposta_dto(cast(Session, object()), 123)

    assert len(metas) == 1
    assert isinstance(metas[0], transferegov_parcerias.MetaPropostaTransfereGov)
    assert metas[0].etapas_proposta == [{"id_etapa_proposta": 7}]


@pytest.mark.parametrize(
    "corpo",
    [
        {"data": []},
        {"data": [], "total_pages": None},
        {"data": [], "total_pages": True},
        {"data": [], "total_pages": -1},
        {"data": [], "total_pages": 2},
    ],
)
def test_paginacao_estrita_rejeita_envelope_ausente_ou_incompleto(monkeypatch, corpo):
    # Arrange: somente a fronteira HTTP é substituída.
    resposta = Response()
    resposta.status_code = 200
    resposta._content = json.dumps(corpo).encode()
    sessao = Session()
    monkeypatch.setattr(sessao, "get", lambda *_args, **_kwargs: resposta)
    # Act / Assert
    with pytest.raises(ValueError, match="Envelope paginado|Página TransfereGov incompleta"):
        transferegov_parcerias._buscar_paginado(sessao, "proposta", {}, exigir_envelope=True)


def test_paginacao_estrita_le_todas_as_paginas_sem_truncar(monkeypatch):
    # Arrange
    chamadas = []
    sessao = Session()

    def consultar(_url, *, params, timeout):
        chamadas.append(params["pagina"])
        resposta = Response()
        resposta.status_code = 200
        resposta._content = json.dumps({"total_pages": 2, "data": [{"id_proposta": params["pagina"]}]}).encode()
        return resposta

    monkeypatch.setattr(sessao, "get", consultar)
    # Act
    registros = transferegov_parcerias._buscar_paginado(sessao, "proposta", {}, exigir_envelope=True)
    # Assert
    assert chamadas == [1, 2]
    assert [r["id_proposta"] for r in registros] == [1, 2]
