"""Leitura de municipality_coverage (granularidade fina da "Cobertura
Assistencial" do Dashboard) -- so GET, escrita pelo mesmo
scripts/run_pipeline_tomografo.py que grava macro_coverage.

Dois niveis:
  GET /municipality-coverage    -- uma linha por municipio (a tabela quando
                                    o filtro escolhido afunila ate
                                    Municipio/CNES).
  GET /health-region-coverage   -- agregado por regiao de saude, computado
                                    em tempo de leitura (GROUP BY sobre
                                    municipality_coverage, com o mesmo
                                    calculo de calcular_cobertura aplicado
                                    na soma -- igual ja acontece com macro,
                                    que tambem agrega municipios antes de
                                    calcular required_qty/balance).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas import HealthRegionCoverageRead, MunicipalityCoverageRead
from app.services import cobertura_assistencial as servico

router = APIRouter(tags=["cobertura-assistencial"])


@router.get("/municipality-coverage", response_model=list[MunicipalityCoverageRead])
def listar_municipality_coverage(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    health_region_code: list[str] | None = Query(default=None),
    municipality: list[str] | None = Query(default=None),
    # RN especifica de TOMOGRAFO (nao generaliza pra outras familias): um
    # municipio abaixo do parametro normativo (100 mil hab.) nao era esperado
    # ter equipamento proprio -- listar esses so gera ruido quando o filtro
    # afunila so ate Regiao de Saude. Ignorado quando o front ja pediu um(ns)
    # municipio(s)/CNES especifico(s) (o usuario escolheu ver aquele, do
    # tamanho que for).
    min_population: int | None = Query(default=None, ge=0),
    # Teto de seguranca, nao paginacao de UI (Bloco 4 do Plan Mode
    # consolidacao 2026-09-17) -- ~5570 municipios do Brasil por familia e
    # o teto natural do dado hoje; 10_000 da margem sem virar paginacao
    # real (o mapa/dashboard precisa do universo filtrado inteiro de uma
    # vez, nao faz sentido paginar isso na UI).
    limit: int = Query(default=10_000, le=10_000, gt=0),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> list[MunicipalityCoverageRead]:
    return servico.listar_municipality_coverage(
        db=db,
        equipment_family=equipment_family,
        execution_id=execution_id,
        state=state,
        macro_code=macro_code,
        health_region_code=health_region_code,
        municipality=municipality,
        min_population=min_population,
        limit=limit,
    )


@router.get("/health-region-coverage", response_model=list[HealthRegionCoverageRead])
def listar_health_region_coverage(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    state: list[str] | None = Query(default=None),
    macro_code: list[str] | None = Query(default=None),
    # Teto de seguranca (Bloco 4 do Plan Mode consolidacao 2026-09-17) --
    # ~450 regioes de saude no Brasil, bem abaixo disso.
    limit: int = Query(default=1000, le=1000, gt=0),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> list[HealthRegionCoverageRead]:
    """Sem min_population -- o parametro de "municipio pequeno demais pra ter
    equipamento proprio" so faz sentido no nivel de municipio; uma regiao de
    saude e sempre um agregado de varios municipios, populacao ja pool
    naturalmente (RN: required_qty da regiao = ceil(populacao somada /
    100_000), nao soma dos ceils individuais -- senao superestimaria
    demanda ao contar cada municipio pequeno como exigindo 1 aparelho
    proprio)."""
    return servico.listar_health_region_coverage(
        db=db,
        equipment_family=equipment_family,
        execution_id=execution_id,
        state=state,
        macro_code=macro_code,
        limit=limit,
    )
