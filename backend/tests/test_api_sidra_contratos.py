import pytest
from pydantic import ValidationError

from app.pipeline.api_sidra import _MetadadosSidra, _RespostaSidra


def test_metadados_sidra_exigem_ano_final():
    with pytest.raises(ValidationError):
        _MetadadosSidra.model_validate({"periodicidade": {}})


def test_resposta_sidra_exige_identificador_e_serie():
    resposta = _RespostaSidra.model_validate(
        {"resultados": [{"series": [{"localidade": {"id": "3550308"}, "serie": {"2026": "100"}}]}]}
    )
    assert resposta.resultados[0].series[0].localidade.id == "3550308"
