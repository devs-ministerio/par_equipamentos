"""Consultas de equipment_offer_row (oferta de equipamento por CNES e subtipo).

Função solta com `db: Session` posicional; só leitura, nunca commita.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.db.models import EquipmentOfferRow

_COLUNAS_ORDENAVEIS = {
    "cnes_code": EquipmentOfferRow.cnes_code,
    "facility_name": EquipmentOfferRow.facility_name,
    "municipality_name": EquipmentOfferRow.municipality_name,
    "state": EquipmentOfferRow.state,
    "existing_qty": EquipmentOfferRow.existing_qty,
    "in_use_qty": EquipmentOfferRow.in_use_qty,
    "sus_flag": EquipmentOfferRow.sus_flag,
}


@dataclass(frozen=True)
class FiltrosOferta:
    equipment_family: str | None = None
    state: list[str] | None = None
    macro_code: list[str] | None = None
    health_region_code: list[str] | None = None
    municipality: list[str] | None = None
    search: str | None = None
    cnes_code: list[str] | None = None


def _aplicar(stmt, f: FiltrosOferta):
    equipment_family, state, macro_code = f.equipment_family, f.state, f.macro_code
    health_region_code, municipality, search, cnes_code = f.health_region_code, f.municipality, f.search, f.cnes_code
    if equipment_family:
        stmt = stmt.where(EquipmentOfferRow.equipment_family == equipment_family)
    if state:
        stmt = stmt.where(EquipmentOfferRow.state.in_(state))
    if macro_code:
        stmt = stmt.where(EquipmentOfferRow.macro_code.in_(macro_code))
    if health_region_code:
        stmt = stmt.where(EquipmentOfferRow.health_region_code.in_(health_region_code))
    if cnes_code:
        stmt = stmt.where(EquipmentOfferRow.cnes_code.in_(cnes_code))
    if municipality:
        # "NOME|UF" -- muitos municipios brasileiros compartilham nome entre
        # estados diferentes (ex.: Santa Rita na PB e no MA), entao o nome
        # sozinho e ambiguo; o front sempre manda o par completo.
        condicoes = []
        for item in municipality:
            nome, _, uf = item.partition("|")
            if uf:
                condicoes.append(and_(EquipmentOfferRow.municipality_name == nome, EquipmentOfferRow.state == uf))
            else:
                condicoes.append(EquipmentOfferRow.municipality_name == nome)
        stmt = stmt.where(or_(*condicoes))
    if search:
        termo = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                EquipmentOfferRow.facility_name.ilike(termo),
                EquipmentOfferRow.cnes_code.ilike(termo),
                EquipmentOfferRow.municipality_name.ilike(termo),
            )
        )
    return stmt


def listar_linhas_paginadas(
    db: Session, exec_id: int, filtros: FiltrosOferta, *, sort_by: str, sort_dir: str, limit: int, offset: int
) -> tuple[int, list[EquipmentOfferRow]]:
    stmt = _aplicar(select(EquipmentOfferRow).where(EquipmentOfferRow.execution_id == exec_id), filtros)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    coluna = _COLUNAS_ORDENAVEIS.get(sort_by, EquipmentOfferRow.facility_name)
    stmt = stmt.order_by(coluna.desc() if sort_dir == "desc" else coluna.asc()).limit(limit).offset(offset)
    return total, list(db.execute(stmt).scalars().all())


def somar_totais(db: Session, exec_id: int, filtros: FiltrosOferta) -> tuple[Any, Any]:
    stmt = select(
        func.coalesce(func.sum(EquipmentOfferRow.existing_qty), 0),
        func.coalesce(func.sum(EquipmentOfferRow.in_use_qty).filter(EquipmentOfferRow.sus_flag.is_(True)), 0),
    ).where(EquipmentOfferRow.execution_id == exec_id)
    existing_total, available_total = db.execute(_aplicar(stmt, filtros)).one()
    return existing_total, available_total


def somar_por_natureza_juridica(db: Session, exec_id: int, filtros: FiltrosOferta) -> list[tuple[Any, Any, Any]]:
    stmt = select(
        EquipmentOfferRow.legal_nature,
        func.coalesce(func.sum(EquipmentOfferRow.existing_qty), 0),
        func.coalesce(func.sum(EquipmentOfferRow.in_use_qty).filter(EquipmentOfferRow.sus_flag.is_(True)), 0),
    ).where(EquipmentOfferRow.execution_id == exec_id)
    stmt = _aplicar(stmt, filtros).group_by(EquipmentOfferRow.legal_nature)
    return [tuple(r) for r in db.execute(stmt).all()]  # type: ignore[misc]


# Teto de seguranca invisivel (Bloco 4 do Plan Mode consolidacao 2026-09-17) -- SEM query param
# exposto de proposito: a lista de opcoes e "lista completa" por design (dropdown bidirecional).
LIMITE_OPCOES_ESTABELECIMENTO = 20_000


def listar_opcoes_estabelecimentos(db: Session, exec_id: int, equipment_family: str | None) -> list[dict[str, Any]]:
    stmt = select(
        EquipmentOfferRow.cnes_code,
        func.max(EquipmentOfferRow.facility_name).label("facility_name"),
        func.max(EquipmentOfferRow.state).label("state"),
        func.max(EquipmentOfferRow.macro_code).label("macro_code"),
        func.max(EquipmentOfferRow.macro_name).label("macro_name"),
        func.max(EquipmentOfferRow.health_region_code).label("health_region_code"),
        func.max(EquipmentOfferRow.health_region_name).label("health_region_name"),
        func.max(EquipmentOfferRow.municipality_name).label("municipality_name"),
    ).where(EquipmentOfferRow.execution_id == exec_id)
    if equipment_family:
        stmt = stmt.where(EquipmentOfferRow.equipment_family == equipment_family)
    stmt = stmt.group_by(EquipmentOfferRow.cnes_code).limit(LIMITE_OPCOES_ESTABELECIMENTO)
    return [dict(r) for r in db.execute(stmt).mappings().all()]


@dataclass(frozen=True)
class RecorteGeografico:
    """Raio (km) em volta de um ponto: pre-corte por bounding box em SQL; o corte exato (Haversine) e do servico."""

    lat: float
    lon: float
    raio_km: float


LIMITE_MODO_RAIO = 2000


def listar_estabelecimentos_agregados(
    db: Session,
    exec_id: int,
    filtros: FiltrosOferta,
    *,
    sus_flag: bool | None,
    in_use_sus: bool | None,
    raio: RecorteGeografico | None,
    sort_by: str,
    sort_dir: str,
    limit: int,
    offset: int,
) -> tuple[int, list[dict[str, Any]]]:
    base = _aplicar(select(EquipmentOfferRow).where(EquipmentOfferRow.execution_id == exec_id), filtros)
    if sus_flag is not None:
        base = base.where(EquipmentOfferRow.sus_flag.is_(sus_flag))
    if in_use_sus:
        base = base.where(EquipmentOfferRow.sus_flag.is_(True), EquipmentOfferRow.in_use_qty > 0)
    if raio is not None:
        # ~111km por grau de latitude; longitude encolhe com cos(latitude) -- usa a latitude do
        # ponto de busca (erro desprezivel num raio de dezenas/centenas de km).
        delta_lat = raio.raio_km / 111.0
        delta_lon = raio.raio_km / (111.0 * max(math.cos(math.radians(raio.lat)), 0.05))
        base = base.where(
            EquipmentOfferRow.latitude.is_not(None),
            EquipmentOfferRow.longitude.is_not(None),
            EquipmentOfferRow.latitude.between(raio.lat - delta_lat, raio.lat + delta_lat),
            EquipmentOfferRow.longitude.between(raio.lon - delta_lon, raio.lon + delta_lon),
        )
    base_sub = base.subquery()

    # coalesce com placeholder ASCII (nao acentuado) -- literal acentuado como parametro de bind vira
    # mojibake dentro do json_build_object (confirmado ao vivo); o servico troca pelo rotulo de verdade.
    tipo_json = func.json_build_object(
        "tipo",
        func.coalesce(base_sub.c.equipment_subtype, "NAO_INFORMADO"),
        "qtd",
        base_sub.c.existing_qty,
    )
    agregado = select(
        base_sub.c.cnes_code,
        func.max(base_sub.c.facility_name).label("facility_name"),
        func.max(base_sub.c.municipality_name).label("municipality_name"),
        func.max(base_sub.c.macro_code).label("macro_code"),
        func.max(base_sub.c.macro_name).label("macro_name"),
        func.max(base_sub.c.health_region_code).label("health_region_code"),
        func.max(base_sub.c.health_region_name).label("health_region_name"),
        func.max(base_sub.c.state).label("state"),
        func.sum(base_sub.c.existing_qty).label("existing_qty"),
        func.sum(base_sub.c.in_use_qty).label("in_use_qty"),
        func.bool_or(base_sub.c.sus_flag).label("sus_flag"),
        func.max(base_sub.c.latitude).label("latitude"),
        func.max(base_sub.c.longitude).label("longitude"),
        func.max(base_sub.c.legal_nature).label("legal_nature"),
        func.json_agg(tipo_json).label("types"),
    ).group_by(base_sub.c.cnes_code)

    total = db.execute(select(func.count()).select_from(agregado.subquery())).scalar_one()

    colunas = agregado.selected_columns
    ordenacao = {
        "cnes_code": colunas.cnes_code,
        "facility_name": colunas.facility_name,
        "municipality_name": colunas.municipality_name,
        "state": colunas.state,
        "existing_qty": colunas.existing_qty,
        "in_use_qty": colunas.in_use_qty,
        "sus_flag": colunas.sus_flag,
    }
    coluna = ordenacao.get(sort_by, colunas.facility_name)
    agregado = agregado.order_by(coluna.desc() if sort_dir == "desc" else coluna.asc())
    if raio is not None:
        # esse modo alimenta um mapa (quer TODOS os pontos do raio de uma vez), nao uma tabela paginada.
        agregado = agregado.limit(LIMITE_MODO_RAIO)
    else:
        agregado = agregado.limit(limit).offset(offset)
    return total, [dict(r) for r in db.execute(agregado).mappings().all()]
