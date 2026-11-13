"""Geração de relatórios Excel/Word -- Plan Mode docs/arquitetura/
planmode-relatorios-2026-09-25.md, Blocos 2 e 4.

GET (não POST): é leitura sem mudança de estado -- evita exigir o header
CSRF (`app/main.py::csrf_middleware` só cobre POST/PUT/PATCH/DELETE) só
pra viabilizar um download, e mantém o padrão já usado pelo resto da API.
Atrás de `require_current_user`, mesmo gate do resto do app.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.rate_limit import chave_por_sessao, limiter
from app.schemas_relatorios_encerrados import PreviaEncerrados
from app.schemas_relatorios_entregues import PreviaEntregues
from app.schemas_relatorios_previsoes import PreviaPrevisoes
from app.services.relatorios import FiltroRelatorio, montar_relatorio
from app.services.relatorios_encerrados import previa_encerrados
from app.services.relatorios_entregues import previa_entregues
from app.services.relatorios_previsoes import previa_previsoes

router = APIRouter(prefix="/relatorios", tags=["relatorios"])

_MEDIA_TYPE = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@router.get("", response_model=None, response_class=StreamingResponse)
@limiter.limit("10/minute", key_func=chave_por_sessao)
def gerar_relatorio(
    request: Request,
    formato: Literal["xlsx", "docx"],
    tipo_relatorio: Literal["instrumentos_repasse", "analise_merito"] = "instrumentos_repasse",
    nivel: Literal["simplificado", "completo"] = "simplificado",
    escopo: Literal["brasil", "regiao", "uf", "municipio", "cnes"] = "brasil",
    regiao: str | None = Query(default=None),
    uf: str | None = Query(default=None),
    municipio: str | None = Query(default=None),
    cnes: str | None = Query(default=None),
    ano_inicio: int | None = Query(default=None),
    ano_fim: int | None = Query(default=None),
    situacao: str | None = Query(default=None),
    programa: str | None = Query(default=None),
    tipo_contratacao: str | None = Query(default=None),
    equipamento: str | None = Query(default=None),
    busca: str | None = Query(default=None),
    encerramento: Literal["todos", "encerrados", "entregues", "previsoes"] = "todos",
    situacao_conclusao: str | None = Query(default=None),
    situacao_origem: Literal["instrumento", "monitoramento", "proposta"] | None = Query(default=None),
    periodo_por: Literal["ano_instrumento", "data_do_evento"] = "ano_instrumento",
    data_inicio: date | None = Query(default=None),
    data_fim: date | None = Query(default=None),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> StreamingResponse:
    filtro = FiltroRelatorio(
        escopo=escopo,
        regiao=regiao,
        uf=uf,
        municipio=municipio,
        cnes=cnes,
        ano_inicio=ano_inicio,
        ano_fim=ano_fim,
        situacao=situacao,
        programa=programa,
        tipo_contratacao=tipo_contratacao,
        equipamento=equipamento,
        busca=busca,
        encerramento=encerramento,
        situacao_conclusao=situacao_conclusao,
        situacao_origem=situacao_origem,
        periodo_por=periodo_por,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )
    conteudo = montar_relatorio(db=db, formato=formato, nivel=nivel, tipo_relatorio=tipo_relatorio, filtro=filtro)
    nome_arquivo = f"relatorio-{tipo_relatorio}-{escopo}-{nivel}.{formato}"
    return StreamingResponse(
        iter([conteudo]),
        media_type=_MEDIA_TYPE[formato],
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo}"'},
    )


@router.get("/encerrados", response_model=PreviaEncerrados)
def consultar_encerrados(
    filtro: FiltroRelatorio = Depends(),
    pagina: int = Query(default=1, ge=1),
    limite: int = Query(default=20, ge=1, le=100),
    pagina_pendencias: int = Query(default=1, ge=1),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> PreviaEncerrados:
    return previa_encerrados(
        db=db, filtro=filtro.filtro_encerrados(), pagina=pagina, limite=limite, pagina_pendencias=pagina_pendencias
    )


@router.get("/entregues", response_model=PreviaEntregues)
def consultar_entregues(
    filtro: FiltroRelatorio = Depends(),
    pagina: int = Query(default=1, ge=1),
    limite: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> PreviaEntregues:
    return previa_entregues(db=db, filtro=filtro.filtro_encerrados(), pagina=pagina, limite=limite)


@router.get("/previsoes", response_model=PreviaPrevisoes)
def consultar_previsoes(
    request: Request,
    escopo: Literal["brasil", "regiao", "uf", "municipio", "cnes"] = "brasil",
    regiao: str | None = Query(default=None),
    uf: str | None = Query(default=None),
    municipio: str | None = Query(default=None),
    cnes: str | None = Query(default=None),
    ano_inicio: int | None = Query(default=None),
    ano_fim: int | None = Query(default=None),
    situacao: str | None = Query(default=None),
    situacao_origem: Literal["instrumento", "monitoramento", "proposta"] | None = Query(default=None),
    programa: str | None = Query(default=None),
    tipo_contratacao: str | None = Query(default=None),
    equipamento: str | None = Query(default=None),
    busca: str | None = Query(default=None),
    situacao_conclusao: str | None = Query(default=None),
    pagina: int = Query(default=1, ge=1),
    limite: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> PreviaPrevisoes:
    filtro = FiltroRelatorio(
        escopo=escopo,
        regiao=regiao,
        uf=uf,
        municipio=municipio,
        cnes=cnes,
        ano_inicio=ano_inicio,
        ano_fim=ano_fim,
        situacao=situacao,
        situacao_origem=situacao_origem,
        programa=programa,
        tipo_contratacao=tipo_contratacao,
        equipamento=equipamento,
        busca=busca,
        encerramento="previsoes",
        situacao_conclusao=situacao_conclusao,
    )
    return previa_previsoes(db=db, filtro=filtro, pagina=pagina, limite=limite)
