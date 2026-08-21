"""Cliente do ElastiCNES -- inventario de equipamentos direto do CNES.
Portado de src/extract/api_elasticnes.py (pipeline legado), Fase 1 do SIEO
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
"""
from __future__ import annotations

import time
from typing import TypedDict

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://elasticnes.saude.gov.br/kibana"
INDICE = "cnes-equipamentos*"
TIMEOUT = 60
TAMANHO_PAGINA = 5000

# (EQUIPAMENTO - TIPO, EQUIPAMENTO - CÓDIGO) -> subtipo (canais). Codigos da
# Portaria SAES/MS 3.695/2026; "11" e o codigo antigo, ainda aparece durante
# a transicao.
_DE_PARA_TOMOGRAFO = {
    ("DIAGNOSTICO POR IMAGEM", "11"): None,
    ("DIAGNOSTICO POR IMAGEM", "26"): "4_CANAIS",
    ("DIAGNOSTICO POR IMAGEM", "27"): "16_CANAIS",
    ("DIAGNOSTICO POR IMAGEM", "28"): "32_CANAIS",
    ("DIAGNOSTICO POR IMAGEM", "29"): "64_CANAIS",
    ("DIAGNOSTICO POR IMAGEM", "30"): "128_CANAIS",
}

_DE_PARA_RESSONANCIA = {
    ("DIAGNOSTICO POR IMAGEM", "12"): None,
    ("DIAGNOSTICO POR IMAGEM", "32"): "0_5_TESLA",
    ("DIAGNOSTICO POR IMAGEM", "33"): "1_5_TESLA",
    ("DIAGNOSTICO POR IMAGEM", "34"): "3_TESLA",
    ("DIAGNOSTICO POR IMAGEM", "35"): "CAMPO_ABERTO",
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
    resp = session.post(f"{BASE_URL}/internal/bsearch", json=payload, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    resultado = resp.json()["result"]

    tentativas = 0
    while (resultado.get("isRunning") or resultado.get("isPartial")) and tentativas < 15:
        time.sleep(1.5)
        payload = {"batch": [{"request": {"id": resultado["id"]}, "options": {"strategy": "ese"}}]}
        resp = session.post(f"{BASE_URL}/internal/bsearch", json=payload, headers=headers, timeout=TIMEOUT)
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
        f = h["_source"]
        chave = (f.get("EQUIPAMENTO - TIPO"), f.get("EQUIPAMENTO - CÓDIGO"))
        if chave not in de_para:
            continue  # nao deveria acontecer (filtro ja restringe), mas nunca inventa dado
        registros.append(EquipamentoRow(
            co_cnes=str(f.get("CNES")),
            no_fantasia=f.get("NOME FANTASIA") or None,
            co_ibge=str(f.get("CÓDIGO DO MUNICÍPIO")),
            sg_uf=f.get("UF"),
            ds_subtipo=de_para[chave],
            qt_existente=int(f.get("EQUIPAMENTO - QTD EXISTENTE") or 0),
            qt_uso=int(f.get("EQUIPAMENTO - QTD EM USO") or 0),
            fl_sus=str(f.get("EQUIPAMENTO - SUS?")).strip().upper() == "SIM",
        ))

    return registros, competencia
