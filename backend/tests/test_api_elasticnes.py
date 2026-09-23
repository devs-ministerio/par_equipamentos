"""app/pipeline/api_elasticnes.py::_parse_location -- caso real corrigido
2026-08-24: CNES 3753387 (Botucatu/SP) tinha a coordenada
"-22.887661,48.445866" no proprio CNES, sem o sinal de menos na longitude
-- jogava o ponto pro Oceano Indico (~9700km de distancia), nao pro Brasil.
"""
from __future__ import annotations

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
    registro = RegistroElastiCNES.model_validate({
        "CNES": "001", "CÓDIGO DO MUNICÍPIO": "3550308", "UF": "SP",
        "EQUIPAMENTO - TIPO": "DIAGNOSTICO POR IMAGEM", "EQUIPAMENTO - CÓDIGO": "26",
    })
    assert registro.cnes == "001"
