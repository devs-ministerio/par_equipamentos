"""Escopo restrito do Radar; não altera a carteira nem usa similaridade."""

import re

from app.catalogo_componentes import ALIASES_COMPONENTES, COMPONENTES_ALVO
from app.equipamentos import CATALOGO_EQUIPAMENTOS, RELACOES_FINANCIAMENTO, classificar_descricoes, normalizar_texto

CRITERIO_RADAR = "prioritarios_ms_v1"
CODIGO_MS = "36000"
PRIORITARIOS = frozenset(e.codigo for e in CATALOGO_EQUIPAMENTOS if e.prioritario)


def componente_prioritario(nome: str) -> str | None:
    """Normaliza somente acentos, caixa, espaços e prefixo oficial conhecido."""
    normalizado = re.sub(r"\s+", " ", normalizar_texto(nome))
    for prefixo in ("ATENCAO ESPECIALIZADA EM SAUDE - ", "ATENCAO ESPECIALIZADA A SAUDE - "):
        normalizado = normalizado.removeprefix(prefixo)
    oficial = ALIASES_COMPONENTES.get(normalizado, normalizado)
    return next((alvo for alvo in COMPONENTES_ALVO if oficial == normalizar_texto(alvo)), None)


def equipamentos_prioritarios_do_item(descricao: str) -> set[str]:
    """Serviço, acessório e contexto não comprovam aquisição do equipamento."""
    texto = normalizar_texto(descricao)
    if re.search(
        r"\b(?:CONSULTORIA|CAPITAL SEMENTE|EMPREENDEDOR|MANUTENCAO|ASSISTENCIA TECNICA|"
        r"LOCACAO|ALUGUEL|PECAS?|ACESSORIOS?|INSUMOS?|CONSUMIVEIS|APLICADOR|FONTES? RADIOATIVAS?)\b",
        texto,
    ):
        return set()
    return {
        e.codigo
        for e in classificar_descricoes([descricao])
        if e.codigo in PRIORITARIOS and e.relacao in RELACOES_FINANCIAMENTO
    }
