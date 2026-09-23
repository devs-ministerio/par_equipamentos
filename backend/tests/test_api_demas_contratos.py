import pytest
from pydantic import ValidationError

from app.pipeline.api_demas import _validar_registro_municipio


def test_registro_demas_exige_dimensoes_geograficas_consumidas():
    with pytest.raises(ValidationError):
        _validar_registro_municipio({"codigo_municipio": 1})


def test_registro_demas_preserva_campos_extras_e_normaliza_codigo():
    registro = _validar_registro_municipio({
        "codigo_macrorregiao_saude": 1, "macrorregiao_saude": "Macro", "codigo_regiao_saude": 2,
        "regiao_saude": "Região", "codigo_municipio": 3, "municipio": "SP - Teste", "uf": "São Paulo",
        "competencia": "202609",
    })
    assert registro.codigo_municipio == 3
    assert registro.model_extra == {"competencia": "202609"}
