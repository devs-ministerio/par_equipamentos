"""Catálogo oficial substituto, Comunicado Transferegov 23/2026.

https://api-publica.transferegov.gestao.gov.br/downloads
Não fazer fallback ao repositório descontinuado: HTTP 200 não comprova frescor.
Os nomes lógicos/cache preservam o contrato dos parsers do SIGEO.
"""

BASE_URL = "https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov"
ARQUIVOS = {
    "siconv_convenio": "siconv_convenio.zip",
    "siconv_proposta": "siconv_proposta.zip",
    "siconv_plano_aplicacao": "siconv_plano_aplicacao_detalhado.zip",
    "siconv_programa_proposta": "siconv_programa_proposta.zip",
    "siconv_programa": "siconv_programa.zip",
    "siconv_empenho": "siconv_empenho.zip",
    "siconv_desembolso": "siconv_desembolso.zip",
    "siconv_licitacao": "siconv_licitacao.zip",
    "siconv_termo_aditivo": "siconv_termo_aditivo.zip",
    "siconv_pagamento": "siconv_pagamento.zip",
    "data_carga_siconv": "data_carga_siconv.zip",
}


def url_arquivo(nome: str) -> str:
    if nome not in ARQUIVOS:
        raise ValueError("Arquivo SICONV não cadastrado na fonte oficial atual.")
    return f"{BASE_URL}/{ARQUIVOS[nome]}"
