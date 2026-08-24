"""Distancia geografica entre municipio e equipamento -- alimenta
`MunicipalityCoverage.distance_km_nearest_equipment` (raio de 75 km do
Tomografo, Caderno 1 SUS 2017: "1 por 100 mil habitantes OU raio de 75 km,
o que for atingido primeiro" -- so a parte populacional era calculada ate
2026-08-22, essa distancia e a outra metade do criterio).

Duas fontes de coordenada, os dois lados do calculo:
  - Estabelecimento: latitude/longitude do proprio ElastiCNES (ja em
    equipment_offer_row, ~94% de cobertura).
  - Municipio: nao tinha nenhuma fonte de coordenada no banco (verificado
    2026-08-22) -- vendorizado em data/raw/municipios_coordenadas.csv, a
    partir de github.com/kelvins/municipios-brasileiros (MIT, derivado do
    IBGE -- coordenada da SEDE do municipio, nao um centroide geometrico da
    area; pra distancia de acesso a servico de saude a sede e o ponto certo,
    e onde a populacao se concentra, nao o meio geometrico de um municipio
    que pode ser gigante e vazio). Validado 121/121... 5570/5570 codigos
    batendo 1:1 com ibge_code de municipality_coverage antes de usar.

IMPORTANTE: essa distancia e so INFORMATIVA por enquanto -- NAO entra no
calculo de deficit_status (calcular_cobertura continua so populacional).
Aplicar o "OR raio de 75km -> nao deficiente" na classificacao oficial e
uma decisao normativa que precisa confirmacao explicita antes de mudar o
que conta como Hipo/Hiperssuficiente num municipio (ver comentario em
scripts/run_pipeline_tomografo.py)."""
from __future__ import annotations

import csv
import math
from functools import lru_cache
from pathlib import Path

CAMINHO_COORDENADAS_MUNICIPIOS = Path(__file__).resolve().parents[3] / "data" / "raw" / "municipios_coordenadas.csv"

RAIO_TERRA_KM = 6371.0


def distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Formula de Haversine -- distancia geodesica (grande circulo) entre dois
    pontos lat/long, em km. Nao usa o elipsoide WGS84 completo (Vincenty);
    Haversine erra menos de 0,5% pra distancias dessa ordem (dezenas a
    centenas de km), precisao de sobra pra comparar contra um raio
    normativo de 75 km."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RAIO_TERRA_KM * math.asin(math.sqrt(a))


@lru_cache(maxsize=1)
def carregar_coordenadas_municipios() -> dict[str, tuple[float, float]]:
    """{ibge_code (6 digitos, mesmo formato de municipality_coverage.ibge_code):
    (latitude, longitude)}. Cacheado em memoria (lru_cache) -- arquivo local
    de 5.571 linhas, le uma vez por processo do pipeline, nao por municipio."""
    coordenadas: dict[str, tuple[float, float]] = {}
    with open(CAMINHO_COORDENADAS_MUNICIPIOS, encoding="utf-8") as f:
        for linha in csv.DictReader(f):
            coordenadas[linha["ibge_code"]] = (float(linha["latitude"]), float(linha["longitude"]))
    return coordenadas


@lru_cache(maxsize=1)
def carregar_codigo_ibge_7_digitos() -> dict[str, str]:
    """{ibge_code (6 digitos) : codigo IBGE oficial de 7 digitos (com digito
    verificador)} -- coluna `ibge_code_7` adicionada 2026-08-24 no MESMO CSV
    vendorizado (nao precisou de arquivo novo: e so mais uma coluna, dado ja
    vinha junto na lista oficial da API de localidades do IBGE usada pra
    preencher isso, https://servicodados.ibge.gov.br/api/v1/localidades/
    municipios -- validado 5571/5571 codigos batendo com ibge_code antes de
    gravar). Usado pra buscar o CONTORNO REAL do municipio (poligono, nao
    raio/circulo) na API de malhas do IBGE
    (https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{codigo7}),
    que exige o codigo de 7 digitos -- nosso banco (mesma convencao do
    DATASUS/CNES) usa so 6."""
    codigos: dict[str, str] = {}
    with open(CAMINHO_COORDENADAS_MUNICIPIOS, encoding="utf-8") as f:
        for linha in csv.DictReader(f):
            if linha.get("ibge_code_7"):
                codigos[linha["ibge_code"]] = linha["ibge_code_7"]
    return codigos


def distancia_minima_km(ponto: tuple[float, float], pontos: list[tuple[float, float]]) -> float | None:
    """Menor distancia (km) entre `ponto` e qualquer um de `pontos` -- usado
    pra achar o tomografo SUS mais proximo de um municipio, entre TODOS os
    tomografos do pais (o raio normativo e geografico puro, nao respeita
    fronteira de macro/regiao/UF). None se `pontos` estiver vazio (nenhum
    equipamento geocodificado nessa familia ainda)."""
    if not pontos:
        return None
    lat, lon = ponto
    return min(distancia_km(lat, lon, plat, plon) for plat, plon in pontos)
