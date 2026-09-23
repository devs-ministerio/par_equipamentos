"""Contratos compartilhados do catálogo central de equipamentos."""

from __future__ import annotations

from pydantic import BaseModel

from app.repositories.equipamento_marcadores import MarcadorLido


class EquipamentoMarcadorRead(BaseModel):
    codigo: str
    nome: str
    prioritario: bool
    descricao_original: str
    tipo_evidencia: str
    relacao: str
    confianca: int


def serializar_marcadores(marcadores: list[MarcadorLido]) -> list[EquipamentoMarcadorRead]:
    return [EquipamentoMarcadorRead(**marcador.__dict__) for marcador in marcadores]
