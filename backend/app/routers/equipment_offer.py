"""Leitura de equipment_offer_row (Fase Unificacao) -- so GET, mesma logica
de "usa a execucao mais recente por padrao" do router de macro_coverage.

`/equipment-offer-rows` devolve as linhas cruas (uma por (CNES, subtipo)).
`/equipment-offer-rows/establishments` agrega por CNES e pagina de verdade
no banco (limit/offset, filtro, busca e ordenacao tambem aqui) -- e o que o
Dashboard consome; paginar so no front nao adianta nada se ele ainda precisa
buscar tudo pra filtrar/ordenar localmente.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.repositories.equipment_offer import FiltrosOferta
from app.schemas import (
    EquipmentOfferRowPage,
    EquipmentTotalsRead,
    EstablishmentPage,
    FacilityOptionRead,
    LegalNatureBreakdownRead,
)
from app.services import equipment_offer as servico

router = APIRouter(prefix="/equipment-offer-rows", tags=["equipment-offer-rows"])


@router.get("", response_model=EquipmentOfferRowPage)
def listar_equipment_offer_rows(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    health_region_code: list[str] | None = Query(default=None),
    municipality: list[str] | None = Query(default=None),
    search: str | None = None,
    sort_by: str = "facility_name",
    sort_dir: str = "asc",
    limit: int = Query(default=50, le=10_000, gt=0),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> EquipmentOfferRowPage:
    filtros = FiltrosOferta(equipment_family, state, macro_code, health_region_code, municipality, search)
    return servico.listar_linhas(
        db=db,
        execution_id=execution_id,
        filtros=filtros,
        sort_by=sort_by,
        sort_dir=sort_dir,
        limit=limit,
        offset=offset,
    )


@router.get("/totals", response_model=EquipmentTotalsRead)
def totais_equipamentos(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    health_region_code: list[str] | None = Query(default=None),
    municipality: list[str] | None = Query(default=None),
    cnes_code: list[str] | None = Query(default=None),
    search: str | None = None,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> EquipmentTotalsRead:
    """Soma exata (existing_qty / in_use_qty-onde-sus_flag) pro recorte de
    filtro pedido, direto de equipment_offer_row -- diferente de
    macro_coverage (agregado so por macro), funciona certo pra QUALQUER
    granularidade de filtro (regiao de saude, municipio, cnes), que e o que
    os cards "Total de Equipamentos" / "Total de Equipamentos em uso SUS" do
    Dashboard devem refletir. available_qty = in_use_qty-onde-sus_flag desde
    2026-08-24 -- mesma decisao de app/pipeline/cobertura.py, pra bater com o
    numero gravado em macro_coverage/municipality_coverage."""
    filtros = FiltrosOferta(equipment_family, state, macro_code, health_region_code, municipality, search, cnes_code)
    return servico.totais(db=db, execution_id=execution_id, filtros=filtros)


@router.get("/by-legal-nature", response_model=list[LegalNatureBreakdownRead])
def totais_por_natureza_juridica(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    health_region_code: list[str] | None = Query(default=None),
    municipality: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> list[LegalNatureBreakdownRead]:
    """Soma de existing_qty/available_qty (mesma regra do /totals) agrupada por natureza
    juridica do estabelecimento -- Painel Geral, card "Natureza juridica da oferta SUS"."""
    filtros = FiltrosOferta(equipment_family, state, macro_code, health_region_code, municipality)
    return servico.totais_por_natureza_juridica(db=db, execution_id=execution_id, filtros=filtros)


@router.get("/facilities", response_model=list[FacilityOptionRead])
def listar_estabelecimentos_opcoes(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> list[FacilityOptionRead]:
    """Lista completa (sem filtro geografico nem paginacao) de estabelecimentos
    distintos por CNES, so com os campos que alimentam dropdowns -- o front
    busca isso uma vez por equipment_family e deriva localmente as opcoes de
    TODOS os filtros, de forma totalmente bidirecional."""
    return servico.opcoes_estabelecimentos(db=db, execution_id=execution_id, equipment_family=equipment_family)


@router.get("/establishments", response_model=EstablishmentPage)
def listar_estabelecimentos(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    health_region_code: list[str] | None = Query(default=None),
    municipality: list[str] | None = Query(default=None),
    cnes_code: list[str] | None = Query(default=None),
    search: str | None = None,
    # Raio geografico (km) em volta de near_lat/near_lon -- alternativa ao
    # macro_code pra achar estabelecimentos perto de UM municipio especifico,
    # ignorando fronteira administrativa de macro (2026-08-23: o tomografo
    # mais proximo de um municipio pode estar numa macro vizinha; filtrar so
    # por macro_code escondia esse ponto do mapa mesmo quando ele e o que
    # explica a distancia normativa mostrada no modal do municipio). Pre-corte
    # em SQL por bounding box (barato, usa os indices/scan normal da tabela),
    # corte fino exato por Haversine em Python logo abaixo -- poucos pontos
    # sobram depois do bbox, entao o custo de nao ter isso em SQL e
    # irrelevante.
    near_lat: float | None = Query(default=None),
    near_lon: float | None = Query(default=None),
    radius_km: float | None = Query(default=None, gt=0),
    # Filtro por atendimento SUS -- usado pelo Mapa (2026-08-24) pra achar o
    # "equipamento mais proximo" so entre quem atende SUS, mesmo criterio
    # que ja vale pra oferta em todo o resto do app (config_denominador_
    # oferta="qt_existente_sus") e pro campo pre-calculado do TOMOGRAFO
    # (distance_km_nearest_equipment, ver run_pipeline_tomografo.py -- so
    # contava fl_sus). Bug real corrigido: o modo `near` nao filtrava por
    # SUS antes, entao podia achar/mostrar um estabelecimento PRIVADO como
    # "mais proximo" mesmo quando a distancia normativa (so-SUS) apontava
    # pra outro lugar.
    sus_flag: bool | None = Query(default=None),
    # Para distância e "mais próximo", equipamento SUS parado não é oferta
    # assistencial. A listagem geral continua podendo exibi-lo como dado
    # cadastral/informativo.
    in_use_sus: bool | None = Query(default=None),
    sort_by: str = "facility_name",
    sort_dir: str = "asc",
    # teto alto o bastante pra caber o maior estado (SP, ~1700 estabelecimentos
    # de Tomografo) numa pagina so -- usado pelo Mapa, que busca sob demanda
    # so a UF selecionada em vez de paginar dentro do proprio painel lateral.
    limit: int = Query(default=50, le=2000, gt=0),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> EstablishmentPage:
    """Mesma fonte do endpoint acima, mas agregada por CNES -- um
    estabelecimento pode ter mais de uma linha crua (tomografos de subtipos
    diferentes), aqui ja vem somado com `types` guardando a quebra."""
    filtros = FiltrosOferta(equipment_family, state, macro_code, health_region_code, municipality, search, cnes_code)
    return servico.listar_estabelecimentos(
        db=db,
        execution_id=execution_id,
        filtros=filtros,
        near_lat=near_lat,
        near_lon=near_lon,
        radius_km=radius_km,
        sus_flag=sus_flag,
        in_use_sus=in_use_sus,
        sort_by=sort_by,
        sort_dir=sort_dir,
        limit=limit,
        offset=offset,
    )
