"""Leitura de equipment_offer_row (Fase Unificacao) -- so GET, mesma logica
de "usa a execucao mais recente por padrao" do router de macro_coverage.

`/equipment-offer-rows` devolve as linhas cruas (uma por (CNES, subtipo)).
`/equipment-offer-rows/establishments` agrega por CNES e pagina de verdade
no banco (limit/offset, filtro, busca e ordenacao tambem aqui) -- e o que o
Dashboard consome; paginar so no front nao adianta nada se ele ainda precisa
buscar tudo pra filtrar/ordenar localmente.
"""

from __future__ import annotations

import math

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import Competency, EquipmentOfferRow, Execution, User
from app.pipeline.geo import distancia_km
from app.schemas import (
    EquipmentOfferRowPage,
    EquipmentOfferRowRead,
    EquipmentTotalsRead,
    EstablishmentPage,
    EstablishmentRead,
    FacilityOptionRead,
    LegalNatureBreakdownRead,
)

router = APIRouter(prefix="/equipment-offer-rows", tags=["equipment-offer-rows"])

_COLUNAS_ORDENAVEIS = {
    "cnes_code": EquipmentOfferRow.cnes_code,
    "facility_name": EquipmentOfferRow.facility_name,
    "municipality_name": EquipmentOfferRow.municipality_name,
    "state": EquipmentOfferRow.state,
    "existing_qty": EquipmentOfferRow.existing_qty,
    "in_use_qty": EquipmentOfferRow.in_use_qty,
    "sus_flag": EquipmentOfferRow.sus_flag,
}


def _latest_execution_id(db: Session, equipment_family: str | None) -> int | None:
    # Ver mesmo comentario em app/routers/macro_coverage.py -- sem escopar por
    # familia, "a execucao mais recente" pode ser de outra familia e o filtro
    # execution_id + equipment_family sempre da 0 linhas.
    stmt = (
        select(Execution.id)
        .join(Competency, Execution.competency_id == Competency.id)
        .order_by(Execution.started_at.desc())
        .limit(1)
    )
    if equipment_family:
        stmt = stmt.where(Competency.equipment_family == equipment_family)
    return db.execute(stmt).scalar_one_or_none()


def _aplicar_filtros(
    stmt, equipment_family, state, macro_code, health_region_code, municipality, search, cnes_code=None
):
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
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return EquipmentOfferRowPage(items=[], total=0)

    stmt = select(EquipmentOfferRow).where(EquipmentOfferRow.execution_id == exec_id)
    stmt = _aplicar_filtros(stmt, equipment_family, state, macro_code, health_region_code, municipality, search)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()

    coluna = _COLUNAS_ORDENAVEIS.get(sort_by, EquipmentOfferRow.facility_name)
    stmt = stmt.order_by(coluna.desc() if sort_dir == "desc" else coluna.asc())
    stmt = stmt.limit(limit).offset(offset)

    rows = db.execute(stmt).scalars().all()
    return EquipmentOfferRowPage(
        items=[EquipmentOfferRowRead.model_validate(r) for r in rows],
        total=total,
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
    Dashboard devem refletir (RF corrigido: antes eles usavam macro_coverage
    e mostravam o total da macro inteira mesmo filtrando por um municipio
    so). available_qty = in_use_qty-onde-sus_flag desde 2026-08-24 (antes
    era existing_qty-onde-sus_flag) -- mesma decisao de
    app/pipeline/cobertura.py, pra bater com o numero gravado em
    macro_coverage/municipality_coverage (esse endpoint so recalcula em
    tempo de leitura pra granularidade mais fina que macro)."""
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return EquipmentTotalsRead(existing_qty=0, available_qty=0)

    stmt = select(
        func.coalesce(func.sum(EquipmentOfferRow.existing_qty), 0),
        func.coalesce(func.sum(EquipmentOfferRow.in_use_qty).filter(EquipmentOfferRow.sus_flag.is_(True)), 0),
    ).where(EquipmentOfferRow.execution_id == exec_id)
    stmt = _aplicar_filtros(
        stmt, equipment_family, state, macro_code, health_region_code, municipality, search, cnes_code
    )

    existing_total, available_total = db.execute(stmt).one()
    return EquipmentTotalsRead(existing_qty=existing_total, available_qty=available_total)


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
    """Soma de existing_qty/available_qty (mesma regra do /totals, ver
    comentario la) agrupada por natureza juridica do estabelecimento --
    Painel Geral, card "Natureza juridica da oferta SUS" (2026-08-22)."""
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return []

    stmt = select(
        EquipmentOfferRow.legal_nature,
        func.coalesce(func.sum(EquipmentOfferRow.existing_qty), 0),
        func.coalesce(func.sum(EquipmentOfferRow.in_use_qty).filter(EquipmentOfferRow.sus_flag.is_(True)), 0),
    ).where(EquipmentOfferRow.execution_id == exec_id)
    stmt = _aplicar_filtros(stmt, equipment_family, state, macro_code, health_region_code, municipality, None)
    stmt = stmt.group_by(EquipmentOfferRow.legal_nature)

    rows = db.execute(stmt).all()
    return [
        LegalNatureBreakdownRead(
            legal_nature=natureza or "NAO_INFORMADO", existing_qty=existing, available_qty=available
        )
        for natureza, existing, available in rows
    ]


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
    TODOS os filtros (UF/Macro/Regiao de Saude/Municipio/CNES), cada um
    restringido pelos demais ja selecionados, de forma totalmente
    bidirecional (nao ha essa forma de fazer isso paginado no backend sem
    round-trip por combinacao de filtro)."""
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return []

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
    stmt = stmt.group_by(EquipmentOfferRow.cnes_code)
    # Teto de seguranca invisivel (Bloco 4 do Plan Mode consolidacao
    # 2026-09-17) -- SEM query param exposto de proposito: este endpoint e
    # "lista completa" por design (ver docstring acima, dropdown
    # bidirecional), 20_000 e so rede de seguranca contra crescimento
    # descontrolado, bem acima do volume real de estabelecimentos CNES.
    stmt = stmt.limit(20_000)

    rows = db.execute(stmt).mappings().all()
    return sorted(
        (FacilityOptionRead.model_validate(dict(r)) for r in rows),
        key=lambda f: (f.facility_name or "", f.cnes_code),
    )


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
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return EstablishmentPage(items=[], total=0)

    modo_raio = near_lat is not None and near_lon is not None and radius_km is not None

    base = select(EquipmentOfferRow).where(EquipmentOfferRow.execution_id == exec_id)
    base = _aplicar_filtros(
        base, equipment_family, state, macro_code, health_region_code, municipality, search, cnes_code
    )
    if sus_flag is not None:
        base = base.where(EquipmentOfferRow.sus_flag.is_(sus_flag))
    if in_use_sus:
        base = base.where(EquipmentOfferRow.sus_flag.is_(True), EquipmentOfferRow.in_use_qty > 0)
    if modo_raio:
        assert near_lat is not None and near_lon is not None and radius_km is not None
        # ~111km por grau de latitude; longitude encolhe com cos(latitude) --
        # usa a latitude do ponto de busca (erro desprezivel num raio de
        # dezenas/centenas de km, nao precisa recalcular por linha).
        delta_lat = radius_km / 111.0
        delta_lon = radius_km / (111.0 * max(math.cos(math.radians(near_lat)), 0.05))
        base = base.where(
            EquipmentOfferRow.latitude.is_not(None),
            EquipmentOfferRow.longitude.is_not(None),
            EquipmentOfferRow.latitude.between(near_lat - delta_lat, near_lat + delta_lat),
            EquipmentOfferRow.longitude.between(near_lon - delta_lon, near_lon + delta_lon),
        )
    base_sub = base.subquery()

    # coalesce com placeholder ASCII (nao acentuado) -- literal acentuado
    # como parametro de bind vira mojibake dentro do json_build_object
    # (confirmado ao vivo); troca pro rotulo de verdade em Python, depois de
    # ler o resultado.
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

    ordenacao = {
        "cnes_code": agregado.selected_columns.cnes_code,
        "facility_name": agregado.selected_columns.facility_name,
        "municipality_name": agregado.selected_columns.municipality_name,
        "state": agregado.selected_columns.state,
        "existing_qty": agregado.selected_columns.existing_qty,
        "in_use_qty": agregado.selected_columns.in_use_qty,
        "sus_flag": agregado.selected_columns.sus_flag,
    }
    coluna = ordenacao.get(sort_by, agregado.selected_columns.facility_name)
    agregado = agregado.order_by(coluna.desc() if sort_dir == "desc" else coluna.asc())
    if modo_raio:
        # bbox ja restringe bastante (raio de dezenas/centenas de km); teto
        # generoso so de seguranca, ignora offset/limit normais de paginacao
        # -- esse modo alimenta um mapa (quer TODOS os pontos do raio de uma
        # vez), nao uma tabela paginada.
        agregado = agregado.limit(2000)
    else:
        agregado = agregado.limit(limit).offset(offset)

    rows = db.execute(agregado).mappings().all()
    items = []
    for r in rows:
        dados = dict(r)
        for tipo in dados["types"]:
            if tipo["tipo"] == "NAO_INFORMADO":
                tipo["tipo"] = "Não informado"
        items.append(EstablishmentRead.model_validate(dados))

    if modo_raio:
        assert near_lat is not None and near_lon is not None and radius_km is not None
        # Corte exato (Haversine) -- o bbox acima e so um pre-filtro
        # retangular, mais largo que o circulo real (sobra estabelecimento
        # nos "cantos" do quadrado fora do raio real). Guarda a distancia de
        # cada item pra ordenar do mais perto pro mais longe logo abaixo.
        pares = [
            (item, distancia_km(near_lat, near_lon, item.latitude, item.longitude))
            for item in items
            if item.latitude is not None and item.longitude is not None
        ]
        pares = [(item, dist) for item, dist in pares if dist <= radius_km]
        pares.sort(key=lambda par: par[1])

        # Teto pelos mais PROXIMOS -- bug real visto 2026-08-23: municipio
        # perto de regiao metropolitana densa (ex.: Cotia/RRAS4, a ~20km da
        # capital de SP) devolvia quase mil estabelecimentos num raio de
        # 100km, virando poluicao visual (centenas de circulos sobrepostos)
        # e pesado pro navegador renderizar -- justamente o problema de
        # densidade que o modo "raio no municipio" existe pra evitar. O mapa
        # so precisa responder "tem equipamento perto?", nao mostrar um
        # censo completo; os mais proximos ja bastam (e sao os unicos que
        # importam pro criterio de 75km).
        MAX_ESTABELECIMENTOS_RAIO = 60
        items = [item for item, _ in pares[:MAX_ESTABELECIMENTOS_RAIO]]
        total = len(pares)

    return EstablishmentPage(items=items, total=total)
