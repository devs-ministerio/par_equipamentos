"""Leitura da cobertura assistencial (macrorregião, município e região de saúde).

Resolve a execução publicada mais recente e calcula o percentual de cobertura.
Função solta com `db` keyword-only; sem escrita, então nunca commita.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import MacroCoverage
from app.pipeline.cobertura import calcular_cobertura, produtividade_por_familia
from app.pipeline.geo import carregar_codigo_ibge_7_digitos, carregar_coordenadas_municipios
from app.repositories import cobertura_assistencial as repo
from app.repositories import execucoes as execucoes_repo
from app.schemas import HealthRegionCoverageRead, MacroCoverageRead, MunicipalityCoverageRead


def _execucao(db: Session, execution_id: int | None, equipment_family: str | None) -> int | None:
    return execution_id or execucoes_repo.obter_execucao_publicada_mais_recente(db, equipment_family)


def _macro_para_read(row: MacroCoverage) -> MacroCoverageRead:
    data = MacroCoverageRead.model_validate(row)
    if row.required_qty:  # nunca divide por zero/None
        data.coverage_percentage = round((row.available_qty or 0) / row.required_qty * 100, 1)
    return data


def listar_macro_coverage(
    *, db: Session, equipment_family: str | None, execution_id: int | None, macro_code: list[str] | None, limit: int
) -> list[MacroCoverageRead]:
    exec_id = _execucao(db, execution_id, equipment_family)
    if exec_id is None:
        return []
    rows = repo.listar_macro_coverage(
        db, exec_id, equipment_family=equipment_family, macro_code=macro_code, limit=limit
    )
    return [_macro_para_read(r) for r in rows]


def listar_municipality_coverage(
    *,
    db: Session,
    equipment_family: str | None,
    execution_id: int | None,
    state: list[str] | None,
    macro_code: list[str] | None,
    health_region_code: list[str] | None,
    municipality: list[str] | None,
    min_population: int | None,
    limit: int,
) -> list[MunicipalityCoverageRead]:
    exec_id = _execucao(db, execution_id, equipment_family)
    if exec_id is None:
        return []
    rows = repo.listar_municipality_coverage(
        db,
        exec_id,
        equipment_family=equipment_family,
        state=state,
        macro_code=macro_code,
        health_region_code=health_region_code,
        municipality=municipality,
        min_population=min_population,
        limit=limit,
    )
    coordenadas = carregar_coordenadas_municipios()
    codigos_ibge_7 = carregar_codigo_ibge_7_digitos()
    resultado = []
    for r in rows:
        data = MunicipalityCoverageRead.model_validate(r)
        if r.required_qty:
            data.coverage_percentage = round((r.available_qty or 0) / r.required_qty * 100, 1)
        coord = coordenadas.get(r.ibge_code)
        if coord:
            data.latitude, data.longitude = coord
        data.ibge_code_7 = codigos_ibge_7.get(r.ibge_code)
        resultado.append(data)
    return resultado


def listar_health_region_coverage(
    *,
    db: Session,
    equipment_family: str | None,
    execution_id: int | None,
    state: list[str] | None,
    macro_code: list[str] | None,
    limit: int,
) -> list[HealthRegionCoverageRead]:
    exec_id = _execucao(db, execution_id, equipment_family)
    if exec_id is None:
        return []
    linhas = repo.agregar_por_regiao_de_saude(
        db, exec_id, equipment_family=equipment_family, state=state, macro_code=macro_code, limit=limit
    )
    resultado = []
    for r in linhas:
        familia = equipment_family or r["equipment_family"]
        cobertura = calcular_cobertura(
            population=r["population"] or 0,
            in_use_sus=r["available_qty"] or 0,
            produtividade=produtividade_por_familia(familia),
        )
        coverage_percentage = (
            round(cobertura.available_qty / cobertura.required_qty * 100, 1) if cobertura.required_qty else None
        )
        resultado.append(
            HealthRegionCoverageRead(
                health_region_code=r["health_region_code"],
                health_region_name=r["health_region_name"],
                macro_code=r["macro_code"],
                macro_name=r["macro_name"],
                state=r["state"],
                equipment_family=familia or "",
                population=r["population"],
                population_residente=r["population_residente"],
                population_ans=r["population_ans"],
                estimated_need=cobertura.estimated_need,
                required_qty=cobertura.required_qty,
                available_qty=cobertura.available_qty,
                existing_qty=r["existing_qty"],
                facility_count=r["facility_count"],
                balance=cobertura.balance,
                deficit_status=cobertura.deficit_status,
                coverage_percentage=coverage_percentage,
            )
        )
    return resultado
