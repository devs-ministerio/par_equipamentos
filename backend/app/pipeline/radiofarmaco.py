"""Distancia e tempo de acesso ao radiofarmaco (FDG-18F) mais proximo, so
para PET_CT -- alimenta os campos informativos de MunicipalityCoverage
analogos ao raio de 75km do TOMOGRAFO (app/pipeline/geo.py), mas aqui o
"ponto" nao e outro equipamento, e o produtor/fabricante de radiofarmaco
mais proximo.

Base normativa (Portaria de Consolidacao GM/MS n. 1/2017, art. 102-106):
"Adotar o criterio de uma unidade para 1,5 milhao de habitantes. Considerar
a meia-vida do radiofarmaco (FDG), de 110 minutos. O PET/CT deve, assim,
estar situado a uma distancia que permita acesso ao radiofarmaco em, no
maximo, duas horas." So a parte populacional (1,5 milhao) entra no calculo
de cobertura/deficit (run_pipeline_pet_ct.py, PRODUTIVIDADE); a parte de
tempo de acesso ao radiofarmaco e SO INFORMATIVA por enquanto, mesmo
tratamento que o raio de 75km do TOMOGRAFO -- decisao normativa de aplicar
isso na classificacao oficial de deficit ainda pendente de confirmacao.

Fonte dos produtores: data/raw/radiofarmacos_produtores_pet.csv, vendorizado
a partir de data/raw/radiofarmacos_fabricantes_DECAN.xlsx (planilha trazida
2026-08-28, aba "Fabricantes de Radiofarmacos no Brasil - Validado ANVISA +
CNEN + CNES | DECAN/MS"). Filtrado pra so entrar quem PRODUZ radiofarmaco
PET de verdade: Modalidade contem "PET" e Status Producao != distribuicao
comercial (excluidos: linhas so-SPECT e as duas distribuidoras/detentoras de
registro sem fabrica no Brasil, Eckert & Ziegler e Novartis).

IMPORTANTE -- sem API de roteamento real (decisao 2026-08-28, ver
conversa/ADR): distancia rodoviaria e aerea aqui sao ESTIMATIVAS por
formula, nao rota calculada. A base geografica e sempre a distancia em
linha reta (Haversine, geo.distancia_km) a partir do produtor mais
proximo -- mesma fonte de coordenada de municipio que o TOMOGRAFO usa
(geo.carregar_coordenadas_municipios)."""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

from app.pipeline.geo import distancia_km

CAMINHO_PRODUTORES_RADIOFARMACO = (
    Path(__file__).resolve().parents[3] / "data" / "raw" / "radiofarmacos_produtores_pet.csv"
)

# Rodovia: distancia em linha reta nao segue estrada -- fator de sinuosidade
# empirico (rodovia real costuma ficar entre 1,2x e 1,4x a linha reta no
# Brasil) aplicado sobre uma velocidade media de viagem (mistura de rodovia
# e trecho urbano nas pontas, no ~110km/h livre).
FATOR_SINUOSIDADE_RODOVIA = 1.3
VELOCIDADE_MEDIA_RODOVIA_KM_H = 70.0

# Aviao: velocidade de cruzeiro tipica de voo domestico comercial + tempo
# fixo de solo (deslocamento ate aeroporto, checkin/embarque, taxi,
# desembarque, deslocamento ate o servico de saude) -- so faz sentido como
# estimativa pra distancias que justificariam voo; pra distancias curtas o
# tempo fixo de solo domina e o resultado fica pior que rodovia de proposito
# (reflete que ninguem voa pra ir a 50km).
VELOCIDADE_CRUZEIRO_AEREO_KM_H = 800.0
TEMPO_SOLO_AEREO_H = 1.5


class ProdutorRadiofarmaco:
    __slots__ = ("id", "empresa", "municipio", "uf", "status_producao", "latitude", "longitude")

    def __init__(
        self, id: str, empresa: str, municipio: str, uf: str, status_producao: str, latitude: float, longitude: float
    ) -> None:
        self.id = id
        self.empresa = empresa
        self.municipio = municipio
        self.uf = uf
        self.status_producao = status_producao
        self.latitude = latitude
        self.longitude = longitude


@lru_cache(maxsize=1)
def carregar_produtores_radiofarmaco_pet() -> list[ProdutorRadiofarmaco]:
    """Todos os produtores/fabricantes de radiofarmaco PET vendorizados --
    ver docstring do modulo pro criterio de inclusao. Cacheado em memoria
    (lru_cache) -- arquivo local pequeno (13 linhas), le uma vez por
    processo do pipeline."""
    produtores: list[ProdutorRadiofarmaco] = []
    with open(CAMINHO_PRODUTORES_RADIOFARMACO, encoding="utf-8") as f:
        for linha in csv.DictReader(f):
            produtores.append(
                ProdutorRadiofarmaco(
                    id=linha["id"],
                    empresa=linha["empresa"],
                    municipio=linha["municipio"],
                    uf=linha["uf"],
                    status_producao=linha["status_producao"],
                    latitude=float(linha["latitude"]),
                    longitude=float(linha["longitude"]),
                )
            )
    return produtores


def produtor_mais_proximo(
    ponto: tuple[float, float], produtores: list[ProdutorRadiofarmaco]
) -> tuple[ProdutorRadiofarmaco, float] | None:
    """Produtor mais proximo de `ponto` (lat, long) e a distancia (km,
    Haversine) ate ele -- None se `produtores` estiver vazio."""
    if not produtores:
        return None
    mais_proximo = min(
        produtores,
        key=lambda p: distancia_km(ponto[0], ponto[1], p.latitude, p.longitude),
    )
    return mais_proximo, distancia_km(ponto[0], ponto[1], mais_proximo.latitude, mais_proximo.longitude)


def horas_rodovia(distancia_km_reta: float) -> float:
    """Estimativa de horas de viagem rodoviaria -- ver constantes no topo do
    modulo pro porque do fator/velocidade. NAO e rota real (sem API de
    roteamento, decisao 2026-08-28)."""
    return distancia_km_reta * FATOR_SINUOSIDADE_RODOVIA / VELOCIDADE_MEDIA_RODOVIA_KM_H


def horas_aviao(distancia_km_reta: float) -> float:
    """Estimativa de horas de viagem aerea (cruzeiro + tempo fixo de solo) --
    ver constantes no topo do modulo. NAO e rota real."""
    return distancia_km_reta / VELOCIDADE_CRUZEIRO_AEREO_KM_H + TEMPO_SOLO_AEREO_H
