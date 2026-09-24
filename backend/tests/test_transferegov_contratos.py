from typing import cast

import pytest
from pydantic import ValidationError
from requests import Session

from app.pipeline import transferegov_parcerias
from app.pipeline.transferegov_parcerias import _validar_registros_do_endpoint


def test_proposta_exige_identificador_e_preserva_campos_extras():
    resultado = _validar_registros_do_endpoint(
        "proposta", [{"id_proposta": 42, "ds_objeto": "Equipamento", "campo_novo": "evidência"}]
    )
    assert resultado[0]["id_proposta"] == 42
    assert resultado[0]["campo_novo"] == "evidência"


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
