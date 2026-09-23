import json
import logging

import pytest

from app.observability import executar_chamada_externa


class Resposta:
    status_code = 200


def test_registra_chamada_externa_sem_dados_da_requisicao(caplog: pytest.LogCaptureFixture):
    caplog.set_level(logging.INFO, logger="sigeo.http")
    resultado = executar_chamada_externa(
        fonte="SIDRA", operacao="populacao", chamada=lambda: Resposta()
    )

    assert isinstance(resultado, Resposta)
    evento = json.loads(caplog.records[-1].message)
    assert evento == {
        "event": "external_request",
        "source": "SIDRA",
        "operation": "populacao",
        "outcome": "success",
        "status_code": 200,
        "duration_ms": evento["duration_ms"],
    }


def test_registra_tipo_do_erro_sem_expor_mensagem(caplog: pytest.LogCaptureFixture):
    caplog.set_level(logging.WARNING, logger="sigeo.http")
    with pytest.raises(ValueError, match="segredo-nao-logavel"):
        executar_chamada_externa(
            fonte="SIDRA",
            operacao="populacao",
            chamada=lambda: (_ for _ in ()).throw(ValueError("segredo-nao-logavel")),
        )

    evento = json.loads(caplog.records[-1].message)
    assert evento["outcome"] == "error"
    assert evento["error_type"] == "ValueError"
    assert "segredo-nao-logavel" not in caplog.records[-1].message
