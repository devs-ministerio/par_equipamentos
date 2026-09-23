"""Cliente do ElastiCNES -- inventario de equipamentos direto do CNES.
Portado de src/extract/api_elasticnes.py (pipeline legado), Fase 1 do SIGEO
era so TOMOGRAFO (decisao 2026-08-13); RESSONANCIA entrou em 2026-08-21
reaproveitando a mesma busca generica (`_buscar_equipamentos`), so troca o
de-para (tipo, codigo) -> subtipo.

Achado critico (herdado do legado, ainda vale): `EQUIPAMENTO - CÓDIGO` NAO e
unico globalmente -- so dentro de cada `EQUIPAMENTO - TIPO`. Por isso o
filtro abaixo usa sempre o par (tipo, codigo).

Codigos verificados ao vivo em 2026-08-21 (agregacao por
EQUIPAMENTO - CÓDIGO dentro de EQUIPAMENTO - TIPO = DIAGNOSTICO POR IMAGEM):
  Tomografo: 11 (antigo, sem subtipo), 26 (4 canais), 27 (16 canais),
             28 (32 canais), 29 (64 canais), 30 (128 canais)
  Ressonancia: 12 (antigo, sem subtipo), 32 (0.5T), 33 (1.5T), 34 (3T),
               35 (campo aberto)

Codigo verificado ao vivo em 2026-08-28 (mesma agregacao, olhando
EQUIPAMENTO - DESCRICAO de cada codigo pra achar o certo -- nao tinha
comentario nenhum previo sobre PET-CT, decisao 2026-08-13 nunca chegou a
mapear):
  PET_CT: 18 ("18 PET/CT", codigo unico, sem subtipo por canal/tesla como
          Tomografo/Ressonancia).
"""
from __future__ import annotations

import time
from typing import TypedDict

import requests
from pydantic import BaseModel, ConfigDict, Field
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.observability import executar_chamada_externa

BASE_URL = "https://elasticnes.saude.gov.br/kibana"
INDICE = "cnes-equipamentos*"
TIMEOUT = 60
TAMANHO_PAGINA = 5000


class RegistroElastiCNES(BaseModel):
    """Projeção mínima do `_source` usada na oferta de equipamentos."""

    model_config = ConfigDict(extra="allow")

    cnes: str | int = Field(validation_alias="CNES")
    municipio: str | int = Field(validation_alias="CÓDIGO DO MUNICÍPIO")
    uf: str = Field(validation_alias="UF")
    tipo: str = Field(validation_alias="EQUIPAMENTO - TIPO")
    codigo: str = Field(validation_alias="EQUIPAMENTO - CÓDIGO")
    quantidade_existente: int | str | None = Field(default=None, validation_alias="EQUIPAMENTO - QTD EXISTENTE")
    quantidade_uso: int | str | None = Field(default=None, validation_alias="EQUIPAMENTO - QTD EM USO")
    sus: str | None = Field(default=None, validation_alias="EQUIPAMENTO - SUS?")
    location: str | None = None
    nome_fantasia: str | None = Field(default=None, validation_alias="NOME FANTASIA")
    natureza_juridica: str | None = Field(default=None, validation_alias="NATUREZA JURÍDICA CATEGORIA")

# (EQUIPAMENTO - TIPO, EQUIPAMENTO - CÓDIGO) -> subtipo (canais). Codigos da
# Portaria SAES/MS 3.695/2026; "11" e o codigo antigo, ainda aparece durante
# a transicao.
_DE_PARA_TOMOGRAFO: dict[tuple[str, str], str | None] = {
    ("DIAGNOSTICO POR IMAGEM", "11"): None,
    ("DIAGNOSTICO POR IMAGEM", "26"): "4_CANAIS",
    ("DIAGNOSTICO POR IMAGEM", "27"): "16_CANAIS",
    ("DIAGNOSTICO POR IMAGEM", "28"): "32_CANAIS",
    ("DIAGNOSTICO POR IMAGEM", "29"): "64_CANAIS",
    ("DIAGNOSTICO POR IMAGEM", "30"): "128_CANAIS",
}

_DE_PARA_RESSONANCIA: dict[tuple[str, str], str | None] = {
    ("DIAGNOSTICO POR IMAGEM", "12"): None,
    ("DIAGNOSTICO POR IMAGEM", "32"): "0_5_TESLA",
    ("DIAGNOSTICO POR IMAGEM", "33"): "1_5_TESLA",
    ("DIAGNOSTICO POR IMAGEM", "34"): "3_TESLA",
    ("DIAGNOSTICO POR IMAGEM", "35"): "CAMPO_ABERTO",
}

_DE_PARA_PET_CT: dict[tuple[str, str], str | None] = {
    ("DIAGNOSTICO POR IMAGEM", "18"): None,
}


class EquipamentoRow(TypedDict):
    co_cnes: str
    no_fantasia: str | None
    co_ibge: str
    sg_uf: str
    ds_subtipo: str | None
    qt_existente: int
    qt_uso: int
    fl_sus: bool
    latitude: float | None
    longitude: float | None
    natureza_juridica: str | None


# Bounding box generoso do Brasil (latitude/longitude) -- qualquer par fora
# disso e geocodificacao errada no proprio CNES (nao e erro nosso de parse:
# o "," em `location` e SEPARADOR do par "lat,long", nao separador decimal
# -- confirmado 2026-08-24 investigando um caso real, CNES 3753387
# MISERICORDIA BOTUCATUENSE, Botucatu/SP: o CNES tinha "-22.887661,
# 48.445866", faltando so o sinal de menos na longitude, o que jogava o
# ponto pro Oceano Indico perto de Madagascar/Mocambique -- ~9700km de
# distancia do municipio real. Descartar (None, None) em vez de propagar
# segue a mesma filosofia do "nunca inventa" abaixo: um estabelecimento sem
# geocodificacao plausivel fica de fora do mapa/calculo de distancia (mesmo
# tratamento que os ~6% sem coordenada nenhuma), em vez de contaminar com
# uma coordenada logicamente impossivel.
LATITUDE_MIN_BRASIL = -34.0
LATITUDE_MAX_BRASIL = 6.0
LONGITUDE_MIN_BRASIL = -74.5
LONGITUDE_MAX_BRASIL = -32.0


def _parse_location(location: str | None) -> tuple[float | None, float | None]:
    """`location` vem como "lat,long" em texto -- nem todo estabelecimento
    tem coordenada cadastrada. Nunca inventa: qualquer formato inesperado
    OU par fora do bounding box plausivel do Brasil (ver constantes acima)
    vira (None, None) em vez de propagar uma geocodificacao errada da fonte
    (RN-06)."""
    if not location or "," not in location:
        return None, None
    lat_str, _, lon_str = location.partition(",")
    try:
        lat, lon = float(lat_str), float(lon_str)
    except ValueError:
        return None, None
    if not (LATITUDE_MIN_BRASIL <= lat <= LATITUDE_MAX_BRASIL and LONGITUDE_MIN_BRASIL <= lon <= LONGITUDE_MAX_BRASIL):
        return None, None
    return lat, lon


def _sessao_com_retry() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5, backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def _bsearch(session: requests.Session, body: dict) -> dict:
    headers = {"kbn-xsrf": "true", "Content-Type": "application/json; charset=utf-8"}
    payload = {"batch": [{"request": body, "options": {"strategy": "ese"}}]}
    resp = executar_chamada_externa(
        fonte="ElastiCNES",
        operacao="bsearch_iniciar",
        chamada=lambda: session.post(f"{BASE_URL}/internal/bsearch", json=payload, headers=headers, timeout=TIMEOUT),
    )
    resp.raise_for_status()
    resultado = resp.json()["result"]

    tentativas = 0
    while (resultado.get("isRunning") or resultado.get("isPartial")) and tentativas < 15:
        time.sleep(1.5)
        payload = {"batch": [{"request": {"id": resultado["id"]}, "options": {"strategy": "ese"}}]}
        resp = executar_chamada_externa(
            fonte="ElastiCNES",
            operacao="bsearch_consultar",
            chamada=lambda: session.post(f"{BASE_URL}/internal/bsearch", json=payload, headers=headers, timeout=TIMEOUT),
        )
        resp.raise_for_status()
        resultado = resp.json()["result"]
        tentativas += 1

    if resultado.get("isRunning"):
        raise TimeoutError("ElastiCNES nao terminou a busca a tempo (apos 15 tentativas).")
    return resultado["rawResponse"]


def _competencia_mais_recente(session: requests.Session) -> str:
    corpo = _bsearch(session, {"params": {"index": INDICE, "body": {
        "size": 0,
        "aggs": {"comp": {"terms": {"field": "index_comp.keyword", "order": {"_key": "desc"}, "size": 1}}},
    }}})
    return corpo["aggregations"]["comp"]["buckets"][0]["key"]


def buscar_equipamentos_tomografo(competencia: str | None = None) -> tuple[list[EquipamentoRow], str]:
    """Busca o inventario de TOMOGRAFO pra uma competencia (AAAAMM) -- usa a
    mais recente publicada se nao for passada. Retorna (linhas, competencia_usada)."""
    return _buscar_equipamentos(_DE_PARA_TOMOGRAFO, competencia)


def buscar_equipamentos_ressonancia(competencia: str | None = None) -> tuple[list[EquipamentoRow], str]:
    """Idem, pra RESSONANCIA (codigos 12/32/33/34/35 -- ver comentario no topo
    do arquivo)."""
    return _buscar_equipamentos(_DE_PARA_RESSONANCIA, competencia)


def buscar_equipamentos_pet_ct(competencia: str | None = None) -> tuple[list[EquipamentoRow], str]:
    """Idem, pra PET_CT (codigo 18 -- ver comentario no topo do arquivo)."""
    return _buscar_equipamentos(_DE_PARA_PET_CT, competencia)


def _buscar_equipamentos(
    de_para: dict[tuple[str, str], str | None], competencia: str | None
) -> tuple[list[EquipamentoRow], str]:
    session = _sessao_com_retry()
    competencia = competencia or _competencia_mais_recente(session)

    filtro_tipo_codigo = [
        {"bool": {"must": [
            {"term": {"EQUIPAMENTO - TIPO.keyword": tipo}},
            {"term": {"EQUIPAMENTO - CÓDIGO.keyword": codigo}},
        ]}}
        for (tipo, codigo) in de_para
    ]

    linhas = []
    search_after = None
    while True:
        corpo_busca = {
            "size": TAMANHO_PAGINA,
            "_source": [
                "CNES", "NOME FANTASIA", "CÓDIGO DO MUNICÍPIO", "UF", "EQUIPAMENTO - TIPO",
                "EQUIPAMENTO - CÓDIGO", "EQUIPAMENTO - QTD EXISTENTE",
                "EQUIPAMENTO - QTD EM USO", "EQUIPAMENTO - SUS?",
                "location", "NATUREZA JURÍDICA CATEGORIA",
            ],
            "query": {"bool": {"filter": [
                {"term": {"index_comp.keyword": competencia}},
                {"bool": {"should": filtro_tipo_codigo, "minimum_should_match": 1}},
            ]}},
            "sort": [{"CNES.keyword": "asc"}, {"ID.keyword": "asc"}],
        }
        if search_after:
            corpo_busca["search_after"] = search_after

        resposta = _bsearch(session, {"params": {"index": INDICE, "body": corpo_busca}})
        hits = resposta["hits"]["hits"]
        if not hits:
            break
        linhas.extend(hits)
        search_after = hits[-1]["sort"]
        if len(hits) < TAMANHO_PAGINA:
            break

    registros: list[EquipamentoRow] = []
    for h in linhas:
        f = RegistroElastiCNES.model_validate(h["_source"])
        chave = (f.tipo, f.codigo)
        if chave not in de_para:
            continue  # nao deveria acontecer (filtro ja restringe), mas nunca inventa dado
        latitude, longitude = _parse_location(f.location)
        registros.append(EquipamentoRow(
            co_cnes=str(f.cnes),
            no_fantasia=f.nome_fantasia,
            co_ibge=str(f.municipio),
            sg_uf=f.uf,
            ds_subtipo=de_para[chave],
            qt_existente=int(f.quantidade_existente or 0),
            qt_uso=int(f.quantidade_uso or 0),
            fl_sus=str(f.sus).strip().upper() == "SIM",
            latitude=latitude,
            longitude=longitude,
            natureza_juridica=f.natureza_juridica,
        ))

    return registros, competencia
