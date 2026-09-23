import pytest

from app.pipeline.contratos_externos import RespostaExternaInvalidaError, validar_lista_objetos_externos
from app.pipeline.portal_transparencia import _validar_convenio_portal


def test_rejeita_payload_externo_que_nao_e_lista_de_objetos():
    with pytest.raises(RespostaExternaInvalidaError):
        validar_lista_objetos_externos({"data": "html"}, fonte="teste")


def test_preserva_objetos_brutos_para_migracao_progressiva():
    assert validar_lista_objetos_externos([{"id": 1, "campo_novo": "x"}], fonte="teste") == [
        {"id": 1, "campo_novo": "x"}
    ]


def test_convenio_portal_normaliza_valores_consumidos_e_preserva_evidencia():
    dado = _validar_convenio_portal({"valor": "12.5", "situacao": "Em execução", "campo_novo": "ok"})
    assert dado.valor == 12.5
    assert dado.model_extra == {"campo_novo": "ok"}
