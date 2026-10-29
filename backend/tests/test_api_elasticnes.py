"""app/pipeline/api_elasticnes.py::_parse_location -- caso real corrigido
2026-08-24: CNES 3753387 (Botucatu/SP) tinha a coordenada
"-22.887661,48.445866" no proprio CNES, sem o sinal de menos na longitude
-- jogava o ponto pro Oceano Indico (~9700km de distancia), nao pro Brasil.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import cast

import pytest
import requests

from app.pipeline import api_elasticnes
from app.pipeline.api_elasticnes import RegistroElastiCNES, _parse_location


def test_parse_location_coordenada_valida_no_brasil():
    lat, lon = _parse_location("-22.887661,-48.445866")
    assert lat == -22.887661
    assert lon == -48.445866


def test_parse_location_longitude_sem_sinal_de_menos_e_descartada():
    # caso real -- mesma coordenada acima, so sem o "-" na longitude.
    lat, lon = _parse_location("-22.887661,48.445866")
    assert (lat, lon) == (None, None)


def test_parse_location_fora_do_brasil_e_descartada():
    # Madri, Espanha -- plausivel em outro dataset, nao no nosso.
    lat, lon = _parse_location("40.4168,-3.7038")
    assert (lat, lon) == (None, None)


def test_parse_location_vazia_ou_sem_virgula():
    assert _parse_location(None) == (None, None)
    assert _parse_location("") == (None, None)
    assert _parse_location("sem coordenada") == (None, None)


def test_parse_location_formato_invalido_nao_quebra():
    assert _parse_location("abc,def") == (None, None)


def test_registro_cnes_exige_chaves_usadas_na_oferta():
    registro = RegistroElastiCNES.model_validate(
        {
            "CNES": "001",
            "CÓDIGO DO MUNICÍPIO": "3550308",
            "UF": "SP",
            "EQUIPAMENTO - TIPO": "DIAGNOSTICO POR IMAGEM",
            "EQUIPAMENTO - CÓDIGO": "26",
        }
    )
    assert registro.cnes == "001"


@pytest.mark.parametrize("estado", [{"isRunning": False, "isPartial": True}, {"isRunning": True, "isPartial": False}])
def test_bsearch_nao_aceita_resultado_incompleto(monkeypatch, estado):
    # Arrange: somente I/O da fonte e espera são substituídos.
    resultado = {"id": "busca-sintetica", "rawResponse": {"hits": {"hits": []}}, **estado}
    resposta = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"result": resultado})
    sessao = SimpleNamespace(post=lambda *args, **kwargs: resposta)
    monkeypatch.setattr(api_elasticnes.time, "sleep", lambda _: None)
    # Act / Assert
    with pytest.raises(TimeoutError, match="resposta íntegra"):
        api_elasticnes._bsearch(cast(requests.Session, sessao), {})


@pytest.mark.parametrize("raw", [{"timed_out": True}, {"_shards": {"failed": 1}}])
def test_bsearch_recusa_timeout_ou_shard_com_falha(raw):
    # Arrange
    resposta = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"result": {"rawResponse": raw}})
    sessao = SimpleNamespace(post=lambda *args, **kwargs: resposta)
    # Act / Assert
    with pytest.raises(ValueError, match="falha parcial"):
        api_elasticnes._bsearch(cast(requests.Session, sessao), {})


def test_bsearch_devolve_resposta_completa():
    # Arrange
    raw = {"hits": {"hits": [{"_id": "sintetico"}]}, "_shards": {"failed": 0}}
    resposta = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"result": {"rawResponse": raw}})
    sessao = SimpleNamespace(post=lambda *args, **kwargs: resposta)
    # Act
    retorno = api_elasticnes._bsearch(cast(requests.Session, sessao), {})
    # Assert
    assert retorno == raw
