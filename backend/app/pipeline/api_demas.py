"""Cliente da API de Dados Abertos do DEMAS/Ministerio da Saude -- fonte de
dim_municipio/dim_macrorregiao. Portado de src/extract/api_demas.py
(pipeline legado), sem os dataclasses Macrorregiao/Municipio (viram dict
simples aqui, mais direto pra montar as linhas do banco).

Endpoint verificado ao vivo em 2026-07-24:
  GET https://apidadosabertos.saude.gov.br/macrorregiao-e-regiao-de-saude/municipio
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, TypedDict

import requests
from pydantic import BaseModel, ConfigDict
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.observability import executar_chamada_externa
from app.pipeline.contratos_externos import validar_lista_objetos_externos, validar_objeto_externo
from app.pipeline.texto import normalizar_texto

BASE_URL = "https://apidadosabertos.saude.gov.br"
ENDPOINT_MUNICIPIO = "/macrorregiao-e-regiao-de-saude/municipio"
LIMITE_PAGINA = 860
TIMEOUT = 120


class RegistroMunicipioDemas(BaseModel):
    """Contrato mínimo da dimensão geográfica usada pelos pipelines."""

    model_config = ConfigDict(extra="allow")

    codigo_macrorregiao_saude: str | int
    macrorregiao_saude: str
    codigo_regiao_saude: str | int
    regiao_saude: str
    codigo_municipio: str | int
    municipio: str
    uf: str


class Municipio(TypedDict):
    co_ibge: str
    no_municipio: str
    sg_uf: str
    co_macro: str
    co_regiao: str


class Macrorregiao(TypedDict):
    co_macro: str
    no_macro: str
    sg_uf: str


class RegiaoSaude(TypedDict):
    """Regiao de saude -- camada intermediaria do SUS entre municipio e
    macrorregiao (Municipio -> Regiao de Saude -> Macrorregiao de Saude).
    Mesma chamada da API que ja usavamos pra macrorregiao; so nao estava
    sendo extraida ainda."""

    co_regiao: str
    no_regiao: str
    co_macro: str
    sg_uf: str


def _sessao_com_retry() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def _validar_registro_municipio(registro: dict[str, Any]) -> RegistroMunicipioDemas:
    return RegistroMunicipioDemas.model_validate(registro)


def _paginar(endpoint: str, params: dict[str, str | int]) -> Iterator[RegistroMunicipioDemas]:
    offset = 0
    session = _sessao_com_retry()
    while True:
        resp = executar_chamada_externa(
            fonte="DEMAS",
            operacao=endpoint,
            chamada=lambda: session.get(
                f"{BASE_URL}{endpoint}",
                params={**params, "limit": LIMITE_PAGINA, "offset": offset},
                timeout=TIMEOUT,
            ),
        )
        resp.raise_for_status()
        envelope = validar_objeto_externo(resp.json(), fonte="DEMAS")
        if not envelope:
            return
        chave = next(iter(envelope))
        pagina = validar_lista_objetos_externos(envelope[chave], fonte="DEMAS.municípios")
        if not pagina:
            return
        yield from (_validar_registro_municipio(registro) for registro in pagina)
        if len(pagina) < LIMITE_PAGINA:
            return
        offset += LIMITE_PAGINA


def buscar_municipios_macrorregiao() -> list[RegistroMunicipioDemas]:
    """Baixa a lista completa de municípios como DTOs validados."""
    return list(_paginar(ENDPOINT_MUNICIPIO, params={}))


def montar_dimensoes(
    registros_api: list[RegistroMunicipioDemas],
) -> tuple[dict[str, Macrorregiao], dict[str, RegiaoSaude], dict[str, Municipio]]:
    """Deriva dim_macrorregiao (por co_macro), dim_regiao_saude (por co_regiao)
    e dim_municipio (por co_ibge) a partir dos registros crus da API."""
    macros: dict[str, Macrorregiao] = {}
    regioes: dict[str, RegiaoSaude] = {}
    municipios: dict[str, Municipio] = {}

    for r in registros_api:
        co_macro = str(r.codigo_macrorregiao_saude)
        sg_uf = sigla_uf(r.uf)
        if co_macro not in macros:
            macros[co_macro] = Macrorregiao(co_macro=co_macro, no_macro=r.macrorregiao_saude, sg_uf=sg_uf)
        co_regiao = str(r.codigo_regiao_saude)
        if co_regiao not in regioes:
            regioes[co_regiao] = RegiaoSaude(
                co_regiao=co_regiao,
                no_regiao=r.regiao_saude,
                co_macro=co_macro,
                sg_uf=sg_uf,
            )
        co_ibge = str(r.codigo_municipio)
        municipios[co_ibge] = Municipio(
            co_ibge=co_ibge,
            no_municipio=_limpar_nome_municipio(r.municipio),
            sg_uf=sg_uf,
            co_macro=co_macro,
            co_regiao=co_regiao,
        )
    return macros, regioes, municipios


def _limpar_nome_municipio(nome: str) -> str:
    """A API prefixa o nome com a UF, ex. 'AC - ACRELANDIA'. Remove o prefixo."""
    if " - " in nome:
        return nome.split(" - ", 1)[1]
    return nome


_UF_POR_NOME_NORMALIZADO = {
    normalizar_texto(nome): sigla
    for nome, sigla in {
        "Acre": "AC",
        "Alagoas": "AL",
        "Amapá": "AP",
        "Amazonas": "AM",
        "Bahia": "BA",
        "Ceará": "CE",
        "Distrito Federal": "DF",
        "Espírito Santo": "ES",
        "Goiás": "GO",
        "Maranhão": "MA",
        "Mato Grosso": "MT",
        "Mato Grosso do Sul": "MS",
        "Minas Gerais": "MG",
        "Pará": "PA",
        "Paraíba": "PB",
        "Paraná": "PR",
        "Pernambuco": "PE",
        "Piauí": "PI",
        "Rio de Janeiro": "RJ",
        "Rio Grande do Norte": "RN",
        "Rio Grande do Sul": "RS",
        "Rondônia": "RO",
        "Roraima": "RR",
        "Santa Catarina": "SC",
        "São Paulo": "SP",
        "Sergipe": "SE",
        "Tocantins": "TO",
    }.items()
}


def sigla_uf(nome_ou_sigla: str) -> str:
    """Converte nome de UF (com ou sem acento) pra sigla de 2 letras."""
    texto = (nome_ou_sigla or "").strip()
    if len(texto) == 2:
        return texto.upper()
    try:
        return _UF_POR_NOME_NORMALIZADO[normalizar_texto(texto)]
    except KeyError as exc:
        raise ValueError(f"UF desconhecida: {nome_ou_sigla!r}") from exc
