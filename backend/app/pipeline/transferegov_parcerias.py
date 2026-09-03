"""Cliente da API de dados abertos do modulo Gestao de Parcerias do
TransfereGov.br -- diferente de app/pipeline/portal_transparencia.py (que
consulta convenio LEGADO do SICONV por numero), esta API cobre instrumentos
criados/geridos no TransfereGov novo (proposta -> parceria -> execucao
financeira).

Sem autenticacao (confirmado 2026-09-03, sem `security` no openapi.json e
testado ao vivo sem header nenhum).

Modelo relacional (extraido do dicionario de dados oficial, SchemaSpy, em
https://www.gov.br/transferegov/pt-br/ferramentas-gestao/paineis-gerenciais/arquivos/modelo_dados_api_parcerias.zip
-- FKs reais do banco, nao inferidas). IMPORTANTE: o banco tem 28 tabelas,
mas a API expoe só 20 endpoints -- `etapa_proposta` e `publicacao_parceria`
NAO tem endpoint proprio, a API ja devolve esses campos EMBUTIDOS na
resposta do pai (`meta-proposta` inclui `etapa_*`; `parceria` inclui
`publicacao_*`). Confirmado inspecionando os `parameters` de cada endpoint
no openapi.json -- nao adivinhado.

    programa (raiz, 1) ---< proposta (N)
        proposta (1) ---< meta_proposta (N)  [ja inclui etapa_* embutido, 1:1 aparente na pratica]
                              ---< item_proposta (N, via id_etapa_proposta = meta.etapa_id_etapa_proposta)
        proposta (1) ---< cronograma_desembolso (N)          -- financeiro PREVISTO
        proposta (1) ---< analise_proposta (N)
        proposta (1) ---< distribuicao_recurso_proposta (N)  -- emenda parlamentar
        proposta (1) ---< interveniente_proposta (N)
        proposta (1) ---< proposta_resultado_indicador (N)
        proposta (1) ---< parceria (N, geralmente 0 ou 1 -- so existe apos a proposta virar parceria)
            [parceria ja inclui publicacao_* embutido -- DOU]
            parceria (1) ---< parceria_conta (N) ---< extrato_bancario (N)
            parceria (1) ---< documento_habil (N) ---< ordem_pagamento (N)  -- financeiro EXECUTADO
            parceria (1) ---< empenho_parceria (N)                          -- financeiro EXECUTADO

Pra "monitoramento de equipamento" o campo mais util pra filtrar e
`proposta.ds_objeto` (texto livre, ex. "AQUISICAO DE EQUIPAMENTO..." -- mesmo
padrao de texto usado nos convenios legados do Portal da Transparencia).
`cnpj_ente_recebedor` de `proposta` e o CNPJ do convenente (comparavel direto
com o CNPJ vindo do Portal da Transparencia -- ver
scripts/coletar_transferegov_relacional.py).
"""
from __future__ import annotations

from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://api-publica.transferegov.gestao.gov.br/parcerias"
TIMEOUT = 30
TAMANHO_PAGINA_PADRAO = 100


def _sessao_com_retry() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3, backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def _buscar_paginado(
    session: requests.Session, endpoint: str, filtros: dict[str, Any], limite: int | None = None,
) -> list[dict[str, Any]]:
    """Pagina um endpoint ate esgotar ou atingir `limite` registros (None =
    sem limite, cuidado: alguns entes tem centenas/milhares de propostas)."""
    registros: list[dict[str, Any]] = []
    pagina = 1
    while True:
        params = {**filtros, "pagina": pagina, "tamanho_da_pagina": TAMANHO_PAGINA_PADRAO}
        resp = session.get(f"{BASE_URL}/{endpoint}", params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        corpo = resp.json()
        dados = corpo.get("data", [])
        registros.extend(dados)
        if limite is not None and len(registros) >= limite:
            return registros[:limite]
        if len(dados) < TAMANHO_PAGINA_PADRAO or pagina >= corpo.get("total_pages", pagina):
            break
        pagina += 1
    return registros


def total_propostas_por_cnpj(session: requests.Session, cnpj: str) -> int:
    """So a contagem (1 pagina, tamanho 1) -- usado pra decidir se vale a
    pena expandir um CNPJ com muitas propostas (ex. fundo estadual de saude
    pode ter centenas, a maioria sem relacao com equipamento)."""
    resp = session.get(
        f"{BASE_URL}/proposta",
        params={"cnpj_ente_recebedor": cnpj, "pagina": 1, "tamanho_da_pagina": 1},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("total_items", 0)


def buscar_propostas_por_cnpj(
    session: requests.Session, cnpj: str, limite: int | None = None,
) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "proposta", {"cnpj_ente_recebedor": cnpj}, limite=limite)


def buscar_parcerias_por_proposta(session: requests.Session, id_proposta: int) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "parceria", {"id_proposta": id_proposta})


def buscar_metas_por_proposta(session: requests.Session, id_proposta: int) -> list[dict[str, Any]]:
    """Cada linha ja vem com os campos `etapa_*` embutidos (ver nota no topo
    do arquivo) -- nao precisa de uma segunda chamada pra etapa."""
    return _buscar_paginado(session, "meta-proposta", {"id_proposta": id_proposta})


def buscar_itens_por_etapa(session: requests.Session, id_etapa_proposta: int) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "item-proposta", {"id_etapa_proposta": id_etapa_proposta})


def buscar_cronograma_por_proposta(session: requests.Session, id_proposta: int) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "cronograma-desembolso", {"id_proposta": id_proposta})


def buscar_distribuicao_recurso_por_proposta(session: requests.Session, id_proposta: int) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "distribuicao-recurso-proposta", {"id_proposta": id_proposta})


def buscar_analises_por_proposta(session: requests.Session, id_proposta: int) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "analise-proposta", {"id_proposta": id_proposta})


def buscar_empenhos_por_parceria(session: requests.Session, id_parceria: int) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "empenho-parceria", {"id_parceria": id_parceria})


def buscar_documentos_habeis_por_parceria(session: requests.Session, id_parceria: int) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "documento-habil", {"id_parceria": id_parceria})


def buscar_ordens_pagamento_por_documento(session: requests.Session, id_documento_habil: int) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "ordem-pagamento", {"id_documento_habil": id_documento_habil})


def buscar_contas_por_parceria(session: requests.Session, id_parceria: int) -> list[dict[str, Any]]:
    return _buscar_paginado(session, "parceria-conta", {"id_parceria": id_parceria})


def buscar_extrato_por_conta(session: requests.Session, id_parceria_conta: int, limite: int = 50) -> list[dict[str, Any]]:
    """Extrato pode ter muitos lancamentos -- limitado por padrao (nao e o
    foco do monitoramento de equipamento, so contexto de saldo/movimentacao)."""
    return _buscar_paginado(session, "extrato-bancario", {"id_parceria_conta": id_parceria_conta}, limite=limite)
