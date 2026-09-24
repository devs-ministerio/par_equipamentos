"""Leituras e escritas relacionais dos marcadores de equipamento."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.orm import Session

from app.db.models import EquipamentoCatalogo, EquipamentoMarcador

OrigemMarcador = Literal["convenio", "proposta_candidata", "instrumento_equipamento"]


@dataclass(frozen=True)
class MarcadorLido:
    codigo: str
    nome: str
    prioritario: bool
    descricao_original: str
    tipo_evidencia: str
    relacao: str
    confianca: int


def catalogo_por_codigo(db: Session) -> dict[str, EquipamentoCatalogo]:
    itens = db.execute(select(EquipamentoCatalogo).where(EquipamentoCatalogo.ativo.is_(True))).scalars()
    return {item.codigo: item for item in itens}


def _filtros_por_origem(
    convenio_ids: set[int] | None,
    proposta_ids: set[int] | None,
    instrumento_ids: set[int] | None,
) -> list[ColumnElement[bool]]:
    filtros: list[ColumnElement[bool]] = []
    if convenio_ids:
        filtros.append(EquipamentoMarcador.convenio_id.in_(convenio_ids))
    if proposta_ids:
        filtros.append(EquipamentoMarcador.proposta_candidata_id.in_(proposta_ids))
    if instrumento_ids:
        filtros.append(EquipamentoMarcador.instrumento_equipamento_id.in_(instrumento_ids))
    return filtros


def _origem_do_marcador(marcador: EquipamentoMarcador) -> tuple[OrigemMarcador, int]:
    if marcador.convenio_id is not None:
        return "convenio", marcador.convenio_id
    if marcador.proposta_candidata_id is not None:
        return "proposta_candidata", marcador.proposta_candidata_id
    assert marcador.instrumento_equipamento_id is not None
    return "instrumento_equipamento", marcador.instrumento_equipamento_id


def _marcadores_visiveis(marcadores: list[MarcadorLido]) -> list[MarcadorLido]:
    candidatos = [marcador for marcador in marcadores if marcador.prioritario] or marcadores
    vistos: set[str] = set()
    resultado = []
    for marcador in candidatos:
        if marcador.codigo not in vistos:
            vistos.add(marcador.codigo)
            resultado.append(marcador)
    return resultado


def listar_por_origens(
    db: Session,
    *,
    convenio_ids: set[int] | None = None,
    proposta_ids: set[int] | None = None,
    instrumento_ids: set[int] | None = None,
) -> dict[tuple[OrigemMarcador, int], list[MarcadorLido]]:
    filtros = _filtros_por_origem(convenio_ids, proposta_ids, instrumento_ids)
    if not filtros:
        return {}
    linhas = db.execute(
        select(EquipamentoMarcador, EquipamentoCatalogo)
        .join(EquipamentoCatalogo, EquipamentoCatalogo.id == EquipamentoMarcador.equipamento_catalogo_id)
        .where(or_(*filtros))
        .order_by(EquipamentoCatalogo.prioritario.desc(), EquipamentoCatalogo.nome, EquipamentoMarcador.id)
    ).all()
    resultado: dict[tuple[OrigemMarcador, int], list[MarcadorLido]] = defaultdict(list)
    for marcador, catalogo in linhas:
        resultado[_origem_do_marcador(marcador)].append(
            MarcadorLido(
                codigo=catalogo.codigo,
                nome=catalogo.nome,
                prioritario=catalogo.prioritario,
                descricao_original=marcador.descricao_original,
                tipo_evidencia=marcador.tipo_evidencia,
                relacao=marcador.relacao,
                confianca=marcador.confianca,
            )
        )
    # Um instrumento pode financiar mais de um item. Para a sinalização
    # operacional, porém, equipamento prioritário prevalece sobre os demais:
    # os não prioritários continuam persistidos como evidência auditável, mas
    # não são devolvidos para consumo visual enquanto houver prioritário na
    # mesma origem.
    for chave, marcadores in resultado.items():
        resultado[chave] = _marcadores_visiveis(marcadores)
    return resultado


def obter_existente(
    db: Session,
    *,
    origem: OrigemMarcador,
    origem_id: int,
    equipamento_catalogo_id: int,
    chave_evidencia: str,
) -> EquipamentoMarcador | None:
    coluna = {
        "convenio": EquipamentoMarcador.convenio_id,
        "proposta_candidata": EquipamentoMarcador.proposta_candidata_id,
        "instrumento_equipamento": EquipamentoMarcador.instrumento_equipamento_id,
    }[origem]
    return db.execute(
        select(EquipamentoMarcador).where(
            coluna == origem_id,
            EquipamentoMarcador.equipamento_catalogo_id == equipamento_catalogo_id,
            EquipamentoMarcador.chave_evidencia == chave_evidencia,
        )
    ).scalar_one_or_none()
