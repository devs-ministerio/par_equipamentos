"""Leituras e escritas relacionais dos marcadores de equipamento."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import or_, select
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


def listar_por_origens(
    db: Session,
    *,
    convenio_ids: set[int] | None = None,
    proposta_ids: set[int] | None = None,
    instrumento_ids: set[int] | None = None,
) -> dict[tuple[OrigemMarcador, int], list[MarcadorLido]]:
    filtros = []
    if convenio_ids:
        filtros.append(EquipamentoMarcador.convenio_id.in_(convenio_ids))
    if proposta_ids:
        filtros.append(EquipamentoMarcador.proposta_candidata_id.in_(proposta_ids))
    if instrumento_ids:
        filtros.append(EquipamentoMarcador.instrumento_equipamento_id.in_(instrumento_ids))
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
        if marcador.convenio_id is not None:
            origem: OrigemMarcador = "convenio"
            identificador = marcador.convenio_id
        elif marcador.proposta_candidata_id is not None:
            origem = "proposta_candidata"
            identificador = marcador.proposta_candidata_id
        else:
            origem = "instrumento_equipamento"
            identificador = marcador.instrumento_equipamento_id
        resultado[(origem, identificador)].append(
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
        if any(marcador.prioritario for marcador in marcadores):
            marcadores = [marcador for marcador in marcadores if marcador.prioritario]
        # A mesma família pode aparecer em mais de um item do plano. A API
        # entrega um marcador visual por equipamento; todas as evidências
        # continuam registradas na tabela para auditoria.
        vistos: set[str] = set()
        sem_repeticao = []
        for marcador in marcadores:
            if marcador.codigo not in vistos:
                vistos.add(marcador.codigo)
                sem_repeticao.append(marcador)
        resultado[chave] = sem_repeticao
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
