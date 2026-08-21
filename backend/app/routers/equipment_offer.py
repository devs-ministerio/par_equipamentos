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
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import Competency, EquipmentOfferRow, Execution
from app.schemas import (
    EquipmentOfferRowPage,
    EquipmentOfferRowRead,
    EquipmentTotalsRead,
    EstablishmentPage,
    EstablishmentRead,
    FacilityOptionRead,
    HealthRegionRead,
    MunicipalityRead,
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
    stmt = select(Execution.id).join(Competency, Execution.competency_id == Competency.id).order_by(
        Execution.started_at.desc()
    ).limit(1)
    if equipment_family:
        stmt = stmt.where(Competency.equipment_family == equipment_family)
    return db.execute(stmt).scalar_one_or_none()


def _aplicar_filtros(stmt, equipment_family, state, macro_code, health_region_code, municipality, search, cnes_code=None):
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


@router.get("/municipalities", response_model=list[MunicipalityRead])
def listar_municipios(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    health_region_code: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[MunicipalityRead]:
    """Municipios reais e distintos com estabelecimento cadastrado, respeitando
    os filtros ja aplicados (UF/regiao resolvida em UF/macro) -- substitui a
    lista estatica de "5 maiores cidades por UF" que o front usava antes.
    Devolve tambem o macro_code de cada municipio pra o front conseguir
    restringir a tabela de cobertura (agregada por macro) ao escolher uma
    cidade."""
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return []

    stmt = select(
        EquipmentOfferRow.municipality_name,
        EquipmentOfferRow.state,
        EquipmentOfferRow.macro_code,
    ).where(
        EquipmentOfferRow.execution_id == exec_id,
        EquipmentOfferRow.municipality_name.is_not(None),
    )
    stmt = _aplicar_filtros(stmt, equipment_family, state, macro_code, health_region_code, None, None)
    stmt = stmt.distinct()

    rows = db.execute(stmt).all()
    return sorted(
        (MunicipalityRead(name=nome, state=uf, macro_code=macro) for nome, uf, macro in rows),
        key=lambda m: (m.name, m.state),
    )


@router.get("/health-regions", response_model=list[HealthRegionRead])
def listar_regioes_saude(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[HealthRegionRead]:
    """Regioes de saude reais e distintas com estabelecimento cadastrado,
    respeitando os filtros ja aplicados (UF/regiao geografica resolvida em
    UF/macro). Devolve o macro_code de cada regiao pra o front conseguir
    restringir a tabela de cobertura (agregada por macro) ao escolher uma
    regiao de saude."""
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return []

    stmt = select(
        EquipmentOfferRow.health_region_code,
        EquipmentOfferRow.health_region_name,
        EquipmentOfferRow.state,
        EquipmentOfferRow.macro_code,
    ).where(
        EquipmentOfferRow.execution_id == exec_id,
        EquipmentOfferRow.health_region_code.is_not(None),
    )
    stmt = _aplicar_filtros(stmt, equipment_family, state, macro_code, None, None, None)
    stmt = stmt.distinct()

    rows = db.execute(stmt).all()
    return sorted(
        (HealthRegionRead(code=codigo, name=nome, state=uf, macro_code=macro) for codigo, nome, uf, macro in rows),
        key=lambda r: (r.state, r.name),
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
) -> EquipmentTotalsRead:
    """Soma exata (existing_qty / existing_qty-onde-sus_flag) pro recorte de
    filtro pedido, direto de equipment_offer_row -- diferente de
    macro_coverage (agregado so por macro), funciona certo pra QUALQUER
    granularidade de filtro (regiao de saude, municipio, cnes), que e o que
    os cards "Total de Tomografos" / "Total de Tomografos SUS" do Dashboard
    devem refletir (RF corrigido: antes eles usavam macro_coverage e mostravam
    o total da macro inteira mesmo filtrando por um municipio so)."""
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return EquipmentTotalsRead(existing_qty=0, available_qty=0)

    stmt = select(
        func.coalesce(func.sum(EquipmentOfferRow.existing_qty), 0),
        func.coalesce(func.sum(EquipmentOfferRow.existing_qty).filter(EquipmentOfferRow.sus_flag.is_(True)), 0),
    ).where(EquipmentOfferRow.execution_id == exec_id)
    stmt = _aplicar_filtros(stmt, equipment_family, state, macro_code, health_region_code, municipality, search, cnes_code)

    existing_total, available_total = db.execute(stmt).one()
    return EquipmentTotalsRead(existing_qty=existing_total, available_qty=available_total)


@router.get("/facilities", response_model=list[FacilityOptionRead])
def listar_estabelecimentos_opcoes(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    db: Session = Depends(get_db),
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
    sort_by: str = "facility_name",
    sort_dir: str = "asc",
    # teto alto o bastante pra caber o maior estado (SP, ~1700 estabelecimentos
    # de Tomografo) numa pagina so -- usado pelo Mapa, que busca sob demanda
    # so a UF selecionada em vez de paginar dentro do proprio painel lateral.
    limit: int = Query(default=50, le=2000, gt=0),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> EstablishmentPage:
    """Mesma fonte do endpoint acima, mas agregada por CNES -- um
    estabelecimento pode ter mais de uma linha crua (tomografos de subtipos
    diferentes), aqui ja vem somado com `types` guardando a quebra."""
    exec_id = execution_id or _latest_execution_id(db, equipment_family)
    if exec_id is None:
        return EstablishmentPage(items=[], total=0)

    base = select(EquipmentOfferRow).where(EquipmentOfferRow.execution_id == exec_id)
    base = _aplicar_filtros(base, equipment_family, state, macro_code, health_region_code, municipality, search, cnes_code)
    base_sub = base.subquery()

    # coalesce com placeholder ASCII (nao acentuado) -- literal acentuado
    # como parametro de bind vira mojibake dentro do json_build_object
    # (confirmado ao vivo); troca pro rotulo de verdade em Python, depois de
    # ler o resultado.
    tipo_json = func.json_build_object(
        "tipo", func.coalesce(base_sub.c.equipment_subtype, "NAO_INFORMADO"),
        "qtd", base_sub.c.existing_qty,
    )

    agregado = (
        select(
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
            func.json_agg(tipo_json).label("types"),
        )
        .group_by(base_sub.c.cnes_code)
    )

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
    agregado = agregado.limit(limit).offset(offset)

    rows = db.execute(agregado).mappings().all()
    items = []
    for r in rows:
        dados = dict(r)
        for tipo in dados["types"]:
            if tipo["tipo"] == "NAO_INFORMADO":
                tipo["tipo"] = "Não informado"
        items.append(EstablishmentRead.model_validate(dados))

    return EstablishmentPage(items=items, total=total)
