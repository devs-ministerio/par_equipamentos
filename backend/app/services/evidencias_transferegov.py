"""Normalização progressiva da árvore de evidências do TransfereGov."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import EvidenciaTransfereGov


@dataclass(frozen=True)
class EvidenciaRelacional:
    tipo_recurso: str
    chave_externa: str
    caminho: str
    caminho_pai: str | None
    payload: dict[str, object]


def _registro(valor: object) -> dict[str, object]:
    if not isinstance(valor, Mapping):
        raise ValueError("A evidência TransfereGov precisa ser um objeto.")
    return dict(cast(Mapping[str, object], valor))


def _lista(valor: object) -> list[dict[str, object]]:
    if valor is None:
        return []
    if not isinstance(valor, Sequence) or isinstance(valor, (str, bytes, bytearray)):
        raise ValueError("A coleção de evidências TransfereGov precisa ser uma lista.")
    return [_registro(item) for item in valor]


def _chave(registro: Mapping[str, object], *, tipo: str, posicao: int) -> str:
    for campo in (
        f"id_{tipo.replace('-', '_')}",
        "id_proposta",
        "id_parceria",
        "id_etapa_proposta",
        "id_item_proposta",
        "id_documento_habil",
        "id_ordem_pagamento",
        "id_empenho_parceria",
        "id_parceria_conta",
    ):
        valor = registro.get(campo)
        if valor is not None:
            return str(valor)
    return str(posicao)


def extrair_evidencias_relacionais(detalhe: Mapping[str, object]) -> list[EvidenciaRelacional]:
    """Achata a árvore externa sem perder payload, tipo ou ancestralidade."""
    proposta = _registro(detalhe.get("proposta"))
    id_proposta = proposta.get("id_proposta")
    if id_proposta is None:
        raise ValueError("A evidência TransfereGov exige id_proposta na raiz.")

    raiz = f"proposta:{id_proposta}"
    resultado = [EvidenciaRelacional("proposta", str(id_proposta), raiz, None, proposta)]

    def adicionar_filhos(tipo: str, registros: object, caminho_pai: str, *, incluir_etapas: bool = False) -> None:
        for posicao, registro in enumerate(_lista(registros), 1):
            chave = _chave(registro, tipo=tipo, posicao=posicao)
            caminho = f"{caminho_pai}/{tipo}:{chave}"
            resultado.append(EvidenciaRelacional(tipo, chave, caminho, caminho_pai, registro))
            if incluir_etapas:
                adicionar_filhos("etapa-proposta", registro.get("etapas_proposta"), caminho)
                for etapa_posicao, etapa in enumerate(_lista(registro.get("etapas_proposta")), 1):
                    etapa_chave = _chave(etapa, tipo="etapa-proposta", posicao=etapa_posicao)
                    caminho_etapa = f"{caminho}/etapa-proposta:{etapa_chave}"
                    adicionar_filhos("item-proposta", etapa.get("itens"), caminho_etapa)

    adicionar_filhos("meta-proposta", detalhe.get("metas"), raiz, incluir_etapas=True)
    adicionar_filhos("cronograma-desembolso", detalhe.get("cronograma_desembolso"), raiz)
    adicionar_filhos("analise-proposta", detalhe.get("analise"), raiz)
    adicionar_filhos("distribuicao-recurso-proposta", detalhe.get("distribuicao_recurso"), raiz)

    parceria = detalhe.get("parceria")
    if parceria is not None:
        registro_parceria = _registro(parceria)
        chave_parceria = _chave(registro_parceria, tipo="parceria", posicao=1)
        caminho_parceria = f"{raiz}/parceria:{chave_parceria}"
        resultado.append(EvidenciaRelacional("parceria", chave_parceria, caminho_parceria, raiz, registro_parceria))
        timeline = _registro(detalhe.get("timeline_financeira") or {})
        for tipo, campo in (
            ("parceria-conta", "contas"),
            ("empenho-parceria", "empenhos"),
            ("documento-habil", "documentos_habeis"),
            ("ordem-pagamento", "ordens_pagamento"),
        ):
            adicionar_filhos(tipo, timeline.get(campo), caminho_parceria)
    return resultado


def _hash_payload(payload: Mapping[str, object]) -> str:
    serializado = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serializado.encode("utf-8")).hexdigest()


def registrar_evidencias_relacionais(db: Session, *, proposta_candidata_id: int, detalhe: Mapping[str, object]) -> int:
    """Insere ou atualiza apenas nós alterados da captura oficial."""
    existentes = {
        item.caminho: item
        for item in db.execute(
            select(EvidenciaTransfereGov).where(EvidenciaTransfereGov.proposta_candidata_id == proposta_candidata_id)
        ).scalars()
    }
    alterados = 0
    for evidencia in extrair_evidencias_relacionais(detalhe):
        conteudo_hash = _hash_payload(evidencia.payload)
        existente = existentes.get(evidencia.caminho)
        if existente is not None and existente.hash_conteudo == conteudo_hash:
            continue
        valores = {
            "tipo_recurso": evidencia.tipo_recurso,
            "chave_externa": evidencia.chave_externa,
            "caminho_pai": evidencia.caminho_pai,
            "payload": evidencia.payload,
            "hash_conteudo": conteudo_hash,
        }
        if existente is None:
            db.add(
                EvidenciaTransfereGov(proposta_candidata_id=proposta_candidata_id, caminho=evidencia.caminho, **valores)
            )
        else:
            for campo, valor in valores.items():
                setattr(existente, campo, valor)
        alterados += 1
    return alterados
