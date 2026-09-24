"""Regras de comparação entre conclusão interna e fontes externas."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from datetime import datetime

from app.db.models import InstrumentoEquipamento, PropostaCandidata


def normalizar_status_externo(valor: str | None) -> str | None:
    """Normaliza somente para comparação; o texto original continua exposto."""
    if not valor:
        return None
    sem_acentos = "".join(
        caractere for caractere in unicodedata.normalize("NFKD", valor) if not unicodedata.combining(caractere)
    )
    return " ".join(sem_acentos.casefold().split())


@dataclass(frozen=True)
class DivergenciaConclusao:
    fonte_externa: str
    status_externo_original: str
    status_externo_normalizado: str
    atualizado_em: datetime


def divergencia_conclusao(
    instrumento: InstrumentoEquipamento,
    *,
    fase_concluida: bool,
    proposta: PropostaCandidata | None = None,
) -> DivergenciaConclusao | None:
    """Retorna divergência apenas quando há conclusão interna e fonte conhecida.

    Cargas manuais não têm fonte externa e ficam fora da comparação.
    """
    if not fase_concluida:
        return None

    fonte: str | None = None
    original: str | None = None
    conclusivo: set[str] = set()

    if instrumento.tipo_contratacao == "Convênio":
        fonte = "Prestação de contas (SICONV/TransfereGov legado)"
        original = instrumento.situacao_prestacao_contas
        conclusivo = {"prestacao de contas concluida", "prestacao de contas concluidas"}
    elif proposta is not None:
        fonte = "Proposta TransfereGov"
        original = proposta.situacao_proposta
        conclusivo = {"pago"}
    elif instrumento.tipo_contratacao == "Parceria TransfereGov":
        fonte = "Ordem de pagamento TransfereGov"
        original = instrumento.situacao_ordem_pagamento_transferegov
        conclusivo = {"pago", "paga"}

    normalizado = normalizar_status_externo(original)
    if not fonte or not original or not normalizado or normalizado in conclusivo:
        return None
    return DivergenciaConclusao(
        fonte_externa=fonte,
        status_externo_original=original,
        status_externo_normalizado=normalizado,
        atualizado_em=proposta.created_at if proposta is not None else instrumento.created_at,
    )
