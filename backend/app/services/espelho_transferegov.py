"""Reconciliação da árvore oficial sem depender da ordem das coleções.

JSON é evidência da fonte; campos omitidos e registros ausentes preservam
o último dado confirmado. Identidade ambígua aborta antes da persistência.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import cast

CHAVES_COLECAO = {
    "metas": ("id_meta_proposta",),
    "etapas_proposta": ("id_etapa_proposta",),
    "itens": ("id_item_proposta",),
    "cronograma_desembolso": ("id_proposta_cronograma_item", "id_cronograma_desembolso"),
    "analise": ("id_analise_proposta",),
    "distribuicao_recurso": ("id_distribuicao_recurso_proposta",),
    "contas": ("id_parceria_conta",),
    "empenhos": ("id_empenho_parceria",),
    "documentos_habeis": ("id_documento_habil",),
    "ordens_pagamento": ("id_op", "id_ordem_pagamento"),
    "tipos_analise": ("id_tipo_analise_proposta",),
    "programa_atende_a": ("tp_atende_a",),
}

# Chaves naturais confirmadas na resposta oficial, não posição da lista.
CHAVES_COMPOSTAS = {
    "categorias_despesa_proposta": ("categoria_despesa_proposta", "subcategoria_despesa_proposta"),
    "categorias_despesa": ("categoria_despesa_programa", "subcategoria_despesa_programa"),
    "classificacoes_ingresso": ("id_extrato_lancamento", "id_classificacao_ingresso_tipo"),
}
# A fonte não fornece ID de publicação: tratar como campo-coleção, não
# fabricar identidade por índice/URL/data. Listas desconhecidas seguem bloqueadas.
COLECOES_SEM_ID = frozenset({"publicacoes_parceria"})


@dataclass(frozen=True)
class MudancaOficial:
    caminho: str
    anterior: object
    atual: object


def _registro(valor: object) -> dict[str, object]:
    if not isinstance(valor, Mapping) or not all(isinstance(chave, str) for chave in valor):
        raise ValueError("Captura TransfereGov contém registro inválido.")
    return dict(cast(Mapping[str, object], valor))


def _indice(registros: list[object], campo: str) -> dict[str, dict[str, object]]:
    chaves = CHAVES_COLECAO.get(campo, ())
    resultado = {}
    for valor in registros:
        registro = _registro(valor)
        chave: str | None
        if campo in CHAVES_COMPOSTAS:
            componentes = CHAVES_COMPOSTAS[campo]
            if any(c not in registro for c in componentes) or registro[componentes[0]] is None:
                raise ValueError(f"Coleção TransfereGov {campo} não possui identificador estável.")
            chave = json.dumps([registro[c] for c in componentes], ensure_ascii=False, separators=(",", ":"))
        else:
            chave_simples = next((registro[c] for c in chaves if registro.get(c) is not None), None)
            chave = str(chave_simples) if chave_simples is not None else None
        if chave is None:
            raise ValueError(f"Coleção TransfereGov {campo} não possui identificador estável.")
        identificador = str(chave)
        if identificador in resultado:
            raise ValueError(f"Coleção TransfereGov {campo} contém identificador duplicado.")
        resultado[identificador] = registro
    return resultado


def _reconciliar_colecao_sem_id(
    antigo: object, atual: list[object], trilha: str
) -> tuple[list[dict[str, object]], list[MudancaOficial]]:
    anteriores = [_registro(item) for item in antigo] if isinstance(antigo, list) else []
    novos = [_registro(item) for item in atual]
    # Vazio pode ser resposta parcial: preservar último dado confirmado.
    if not novos:
        return anteriores, []

    def canonico(itens: list[dict[str, object]]) -> list[str]:
        return sorted(json.dumps(item, sort_keys=True, ensure_ascii=False) for item in itens)

    if canonico(anteriores) == canonico(novos):
        return anteriores, []
    return novos, [MudancaOficial(trilha, anteriores, novos)]


def reconciliar_arvore(
    anterior: Mapping[str, object], atual: Mapping[str, object], *, caminho: str = ""
) -> tuple[dict[str, object], list[MudancaOficial]]:
    confirmado = dict(anterior)
    mudancas: list[MudancaOficial] = []
    for campo, valor in atual.items():
        if campo.startswith("_") or valor is None:
            continue
        trilha = f"{caminho}.{campo}" if caminho else campo
        antigo = anterior.get(campo)
        if isinstance(valor, Mapping):
            mesclado, diferencas = reconciliar_arvore(
                _registro(antigo) if isinstance(antigo, Mapping) else {}, _registro(valor), caminho=trilha
            )
            confirmado[campo] = mesclado
            mudancas.extend(diferencas)
        elif isinstance(valor, list):
            if campo in COLECOES_SEM_ID:
                confirmado[campo], diferencas = _reconciliar_colecao_sem_id(antigo, valor, trilha)
                mudancas.extend(diferencas)
                continue
            novos = _indice(valor, campo)
            anteriores = _indice(antigo, campo) if isinstance(antigo, list) else {}
            for identificador, registro in novos.items():
                mesclado, diferencas = reconciliar_arvore(
                    anteriores.get(identificador, {}), registro, caminho=f"{trilha}[{identificador}]"
                )
                anteriores[identificador] = mesclado
                mudancas.extend(diferencas)
            confirmado[campo] = list(anteriores.values())
        elif antigo != valor:
            confirmado[campo] = valor
            mudancas.append(MudancaOficial(trilha, antigo, valor))
    return confirmado, mudancas


def resumir_mudancas(mudancas: list[MudancaOficial]) -> str:
    return "; ".join(
        f"{mudanca.caminho}: coleção alterada ({len(mudanca.anterior) if isinstance(mudanca.anterior, list) else 0} → {len(mudanca.atual)} registro(s))"
        if isinstance(mudanca.atual, list)
        else f"{mudanca.caminho}: {mudanca.anterior if mudanca.anterior is not None else '(não informado)'} → {mudanca.atual}"
        for mudanca in mudancas
    )
