"""app/pipeline/geo.py -- Haversine e o carregamento de coordenadas de
municipio (raio de 75 km do Tomografo, ver comentario no proprio modulo)."""
from __future__ import annotations

from app.pipeline.geo import carregar_coordenadas_municipios, distancia_km, distancia_minima_km


def test_distancia_km_sao_paulo_rio_de_janeiro():
    # distancia real entre os centros das duas cidades e ~357-361km
    # (varia um pouco conforme o ponto de referencia exato usado em cada
    # cidade) -- confere que a formula acerta a ordem de grandeza certa.
    sp = (-23.5505, -46.6333)
    rj = (-22.9068, -43.1729)
    d = distancia_km(*sp, *rj)
    assert 350 < d < 370


def test_distancia_km_mesmo_ponto_e_zero():
    d = distancia_km(-23.5505, -46.6333, -23.5505, -46.6333)
    assert d == 0


def test_distancia_minima_km_acha_o_mais_perto():
    ponto = (-23.5505, -46.6333)  # Sao Paulo
    candidatos = [
        (-22.9068, -43.1729),  # Rio -- ~360km
        (-15.7939, -47.8828),  # Brasilia -- ~870km
        (-23.5329, -46.6395),  # quase o mesmo ponto -- deveria ganhar
    ]
    assert distancia_minima_km(ponto, candidatos) < 5


def test_distancia_minima_km_vazio_e_none():
    assert distancia_minima_km((-23.5505, -46.6333), []) is None


def test_carregar_coordenadas_municipios_cobre_capitais_conhecidas():
    coordenadas = carregar_coordenadas_municipios()
    # sanity check com alguns ibge_code de capital conhecidos (6 digitos,
    # mesmo formato de municipality_coverage.ibge_code) -- confere que o
    # arquivo carrega e a chave esta no formato certo, sem testar o dataset
    # inteiro (5.571 linhas).
    assert "355030" in coordenadas  # Sao Paulo
    lat, lon = coordenadas["355030"]
    assert -24 < lat < -23  # SP fica por volta de -23.5 de latitude
    assert -47 < lon < -46
