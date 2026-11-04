"""Nomes em português dos campos do SICONV, para texto que o usuário lê (avisos, relatórios).

A API oficial devolve colunas como `NR_LICITACAO` ou `UG_RESPONSAVEL`; o usuário nunca deve vê-las cruas.
Campo conhecido usa o rótulo explícito; campo novo cai numa leitura legível derivada dos prefixos
oficiais (`NR_`, `VL_`, `DATA_`...), sem inventar significado além do nome.
"""

from __future__ import annotations

ROTULOS_CAMPOS_SICONV: dict[str, str] = {
    "NR_LICITACAO": "Nº da licitação",
    "NR_PROCESSO_LICITACAO": "Nº do processo da licitação",
    "NR_DL": "Nº do documento de liquidação",
    "VL_SALDO_CONTA": "Saldo da conta",
    "UG_RESPONSAVEL": "Unidade gestora responsável",
    "RESULTADO_PRIMARIO": "Resultado primário",
    "DATA_HOMOLOGACAO_LICITACAO": "Data de homologação da licitação",
    "VALOR_LICITACAO": "Valor da licitação",
    "STATUS_LICITACAO": "Situação da licitação",
    "SITUACAO_ACEITE_PROCESSO_EXECU": "Situação do aceite do processo de execução",
    "DATA_ENVIO_ANALISE": "Data de envio para análise",
    "QTD_DIAS_SEM_DESEMBOLSO": "Dias sem desembolso",
    "VL_GLOBAL_CONV": "Valor global",
    "VL_REPASSE_CONV": "Valor de repasse",
    "VL_EMPENHADO_CONV": "Valor empenhado",
    "VL_DESEMBOLSADO_CONV": "Valor desembolsado",
    "VL_CONTRAPARTIDA_CONV": "Contrapartida",
    "SIT_CONVENIO": "Situação do convênio",
    "VL_GLOBAL_TA": "Valor global do termo aditivo",
    "VALOR_EMPENHO": "Valor do empenho",
    "DESCRICAO": "Descrição",
    "DIA_FIM_VIGENC_CONV": "Fim da vigência",
    "DIA_INIC_VIGENC_CONV": "Início da vigência",
    "DIA_ASSIN_CONV": "Data de assinatura",
    "DIA_PUBL_CONV": "Data de publicação",
}

_PALAVRAS = {
    "descricao": "descrição",
    "convenio": "convênio",
    "licitacao": "licitação",
    "situacao": "situação",
    "numero": "número",
    "observacao": "observação",
    "homologacao": "homologação",
    "execucao": "execução",
    "analise": "análise",
    "publicacao": "publicação",
    "aprovacao": "aprovação",
    "prestacao": "prestação",
    "liquidacao": "liquidação",
    "unidade": "unidade",
    "orgao": "órgão",
    "municipio": "município",
    "proposta": "proposta",
    "ta": "termo aditivo",
}

_PREFIXOS = {
    "NR": "Nº",
    "VL": "Valor",
    "VALOR": "Valor",
    "DATA": "Data",
    "DT": "Data",
    "QTD": "Quantidade",
    "UG": "Unidade gestora",
    "SIT": "Situação",
    "SITUACAO": "Situação",
    "STATUS": "Situação",
    "COD": "Código",
    "DS": "Descrição",
    "NM": "Nome",
    "TP": "Tipo",
}


def rotulo_campo_siconv(campo: str) -> str:
    """Rótulo em português do campo; campo desconhecido vira texto legível, nunca o nome técnico cru."""
    if campo in ROTULOS_CAMPOS_SICONV:
        return ROTULOS_CAMPOS_SICONV[campo]
    partes = [p for p in campo.strip().split("_") if p]
    if not partes:
        return campo
    primeira = _PREFIXOS.get(partes[0].upper())
    brutas = partes[1:] if primeira else partes
    resto = [_PALAVRAS.get(p.lower(), p.lower()) for p in brutas]
    texto = " ".join(([primeira] if primeira else []) + resto)
    return texto[0].upper() + texto[1:]
