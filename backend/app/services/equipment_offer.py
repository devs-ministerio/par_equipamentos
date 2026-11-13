"""Leitura da oferta de equipamento: resolve a execucao publicada e monta as respostas.

Função solta com `db` keyword-only; sem escrita, então nunca commita.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.pipeline.geo import distancia_km
from app.repositories import equipment_offer as repo
from app.repositories import execucoes as execucoes_repo
from app.repositories.equipment_offer import FiltrosOferta, RecorteGeografico
from app.schemas import (
    EquipmentOfferRowPage,
    EquipmentOfferRowRead,
    EquipmentTotalsRead,
    EstablishmentPage,
    EstablishmentRead,
    FacilityOptionRead,
    LegalNatureBreakdownRead,
    PageMeta,
)

# O mapa so precisa responder "tem equipamento perto?", nao mostrar um censo: os mais proximos ja bastam
# (e sao os unicos que importam pro criterio de 75km). Bug real visto 2026-08-23 (Cotia/RRAS4): quase mil
# estabelecimentos num raio de 100km viravam poluicao visual.
MAX_ESTABELECIMENTOS_RAIO = 60


def _execucao(db: Session, execution_id: int | None, equipment_family: str | None) -> int | None:
    return execution_id or execucoes_repo.obter_execucao_publicada_mais_recente(db, equipment_family)


def listar_linhas(
    *,
    db: Session,
    execution_id: int | None,
    filtros: FiltrosOferta,
    sort_by: str,
    sort_dir: str,
    limit: int,
    offset: int,
) -> EquipmentOfferRowPage:
    exec_id = _execucao(db, execution_id, filtros.equipment_family)
    if exec_id is None:
        return EquipmentOfferRowPage(data=[], meta=PageMeta(total=0))
    total, rows = repo.listar_linhas_paginadas(
        db, exec_id, filtros, sort_by=sort_by, sort_dir=sort_dir, limit=limit, offset=offset
    )
    return EquipmentOfferRowPage(
        data=[EquipmentOfferRowRead.model_validate(r) for r in rows], meta=PageMeta(total=total)
    )


def totais(*, db: Session, execution_id: int | None, filtros: FiltrosOferta) -> EquipmentTotalsRead:
    exec_id = _execucao(db, execution_id, filtros.equipment_family)
    if exec_id is None:
        return EquipmentTotalsRead(existing_qty=0, available_qty=0)
    existing_total, available_total = repo.somar_totais(db, exec_id, filtros)
    return EquipmentTotalsRead(existing_qty=existing_total, available_qty=available_total)


def totais_por_natureza_juridica(
    *, db: Session, execution_id: int | None, filtros: FiltrosOferta
) -> list[LegalNatureBreakdownRead]:
    exec_id = _execucao(db, execution_id, filtros.equipment_family)
    if exec_id is None:
        return []
    return [
        LegalNatureBreakdownRead(
            legal_nature=natureza or "NAO_INFORMADO", existing_qty=existing, available_qty=available
        )
        for natureza, existing, available in repo.somar_por_natureza_juridica(db, exec_id, filtros)
    ]


def opcoes_estabelecimentos(
    *, db: Session, execution_id: int | None, equipment_family: str | None
) -> list[FacilityOptionRead]:
    exec_id = _execucao(db, execution_id, equipment_family)
    if exec_id is None:
        return []
    rows = repo.listar_opcoes_estabelecimentos(db, exec_id, equipment_family)
    return sorted(
        (FacilityOptionRead.model_validate(r) for r in rows),
        key=lambda f: (f.facility_name or "", f.cnes_code),
    )


def listar_estabelecimentos(
    *,
    db: Session,
    execution_id: int | None,
    filtros: FiltrosOferta,
    near_lat: float | None,
    near_lon: float | None,
    radius_km: float | None,
    sus_flag: bool | None,
    in_use_sus: bool | None,
    sort_by: str,
    sort_dir: str,
    limit: int,
    offset: int,
) -> EstablishmentPage:
    exec_id = _execucao(db, execution_id, filtros.equipment_family)
    if exec_id is None:
        return EstablishmentPage(data=[], meta=PageMeta(total=0))

    raio = (
        RecorteGeografico(near_lat, near_lon, radius_km)
        if near_lat is not None and near_lon is not None and radius_km is not None
        else None
    )
    total, rows = repo.listar_estabelecimentos_agregados(
        db,
        exec_id,
        filtros,
        sus_flag=sus_flag,
        in_use_sus=in_use_sus,
        raio=raio,
        sort_by=sort_by,
        sort_dir=sort_dir,
        limit=limit,
        offset=offset,
    )
    items = []
    for dados in rows:
        for tipo in dados["types"]:
            if tipo["tipo"] == "NAO_INFORMADO":
                tipo["tipo"] = "Não informado"
        items.append(EstablishmentRead.model_validate(dados))

    if raio is not None:
        # Corte exato (Haversine) -- o bbox em SQL e so um pre-filtro retangular, mais largo que o circulo real.
        pares = [
            (item, distancia_km(raio.lat, raio.lon, item.latitude, item.longitude))
            for item in items
            if item.latitude is not None and item.longitude is not None
        ]
        pares = [(item, dist) for item, dist in pares if dist <= raio.raio_km]
        pares.sort(key=lambda par: par[1])
        items = [item for item, _ in pares[:MAX_ESTABELECIMENTOS_RAIO]]
        total = len(pares)

    return EstablishmentPage(data=items, meta=PageMeta(total=total))
