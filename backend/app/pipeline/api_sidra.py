"""Cliente do SIDRA (IBGE) -- populacao estimada por municipio, ano mais
recente publicado. Portado de src/extract/api_sidra.py (pipeline legado);
so a funcao de populacao geral (as de MAMOGRAFO/faixa etaria nao se aplicam
a Tomografo).

Fonte: agregado 6579 ("Populacao residente estimada"), variavel 9324,
nivel territorial N6 (municipio).
"""

from __future__ import annotations

import requests
from pydantic import BaseModel
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.observability import executar_chamada_externa

BASE_URL = "https://servicodados.ibge.gov.br/api/v3"
AGREGADO_POPULACAO = 6579
VARIAVEL_POPULACAO = 9324
TIMEOUT = 60


class _PeriodicidadeSidra(BaseModel):
    fim: int


class _MetadadosSidra(BaseModel):
    periodicidade: _PeriodicidadeSidra


class _LocalidadeSidra(BaseModel):
    id: str


class _SerieSidra(BaseModel):
    localidade: _LocalidadeSidra
    serie: dict[str, str | int | None]


class _ResultadoSidra(BaseModel):
    series: list[_SerieSidra]


class _RespostaSidra(BaseModel):
    resultados: list[_ResultadoSidra]


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


def _ano_mais_recente() -> int:
    session = _sessao_com_retry()
    resp = executar_chamada_externa(
        fonte="SIDRA",
        operacao="metadados_populacao",
        chamada=lambda: session.get(f"{BASE_URL}/agregados/{AGREGADO_POPULACAO}/metadados", timeout=TIMEOUT),
    )
    resp.raise_for_status()
    return _MetadadosSidra.model_validate(resp.json()).periodicidade.fim


def buscar_populacao_municipios(ano: int | None = None) -> tuple[dict[str, int], int]:
    """Retorna ({co_ibge de 6 digitos: populacao}, ano_usado)."""
    ano = ano or _ano_mais_recente()
    session = _sessao_com_retry()
    resp = executar_chamada_externa(
        fonte="SIDRA",
        operacao="populacao_municipios",
        chamada=lambda: session.get(
            f"{BASE_URL}/agregados/{AGREGADO_POPULACAO}/periodos/{ano}/variaveis/{VARIAVEL_POPULACAO}",
            params={"localidades": "N6[all]"},
            timeout=TIMEOUT,
        ),
    )
    resp.raise_for_status()
    corpo = resp.json()
    if not corpo:
        raise ValueError(f"SIDRA nao retornou dados de populacao pro ano {ano}.")

    populacao: dict[str, int] = {}
    resposta = _RespostaSidra.model_validate(corpo[0])
    if not resposta.resultados:
        raise ValueError(f"SIDRA não retornou séries de população pro ano {ano}.")
    for serie in resposta.resultados[0].series:
        co_ibge_7 = serie.localidade.id
        valor = serie.serie.get(str(ano))
        if valor is None or valor in ("...", "-", "X"):
            continue
        populacao[co_ibge_7[:6]] = int(valor)

    return populacao, ano
