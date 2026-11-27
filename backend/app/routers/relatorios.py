"""Geração de relatórios Excel/Word -- Plan Mode docs/planos/
planmode-relatorios-2026-09-25.md, Blocos 2 e 4.

GET (não POST): é leitura sem mudança de estado -- evita exigir o header
CSRF (`app/main.py::csrf_middleware` só cobre POST/PUT/PATCH/DELETE) só
pra viabilizar um download, e mantém o padrão já usado pelo resto da API.
Atrás de `require_current_user`, mesmo gate do resto do app.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.rate_limit import chave_por_sessao, limiter
from app.schemas_relatorios_encerrados import PreviaEncerrados
from app.schemas_relatorios_entregues import PreviaEntregues
from app.services.fase_acompanhamento import FaseAcompanhamento
from app.services.relatorios import FiltroRelatorio, montar_relatorio
from app.services.relatorios_encerrados import previa_encerrados
from app.services.relatorios_entregues import previa_entregues
from app.services.relatorios_filtro import EtapaRelatorio, TipoRelatorio
from app.services.relatorios_modelo import nome_arquivo as montar_nome_arquivo
from app.services.relatorios_monitorados import Celula, SituacaoEquipamento, TipoMonitorado, montar_relatorio_monitorado
from app.services.relatorios_recorte import previa_propostas

router = APIRouter(prefix="/relatorios", tags=["relatorios"])

_MEDIA_TYPE = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _parametros_do_filtro(
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
    etapa: EtapaRelatorio | None = Query(default=None),
    encerramento: Literal["todos", "encerrados", "entregues"] = "todos",
    situacao_origem: Literal["instrumento", "monitoramento", "proposta"] | None = Query(default=None),
    periodo_por: Literal["ano_instrumento", "data_do_evento"] = "ano_instrumento",
    data_inicio: date | None = Query(default=None),
    data_fim: date | None = Query(default=None),
) -> dict[str, Any]:
    return dict(
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
        etapa=etapa,
        encerramento=encerramento,
        situacao_origem=situacao_origem,
        periodo_por=periodo_por,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )


_ROTULO_ARQUIVO = {
    "equipamentos_monitorados": "equipamentos",
    "instrumentos_monitorados": "instrumentos",
}


@router.get("", response_model=None, response_class=StreamingResponse)
@limiter.limit("10/minute", key_func=chave_por_sessao)
def gerar_relatorio(
    request: Request,
    formato: Literal["xlsx", "docx"],
    tipo_relatorio: TipoRelatorio = "instrumentos_repasse",
    nivel: Literal["simplificado", "completo"] = "simplificado",
    parametros_do_filtro: dict[str, Any] = Depends(_parametros_do_filtro),
    situacao_equipamento: list[SituacaoEquipamento] = Query(default=[]),
    fase_instrumento: Annotated[list[FaseAcompanhamento] | None, Query()] = None,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> StreamingResponse:
    filtro = FiltroRelatorio(**parametros_do_filtro)
    conteudo = montar_relatorio(
        db=db,
        formato=formato,
        nivel=nivel,
        tipo_relatorio=tipo_relatorio,
        filtro=filtro,
        situacoes_equipamento=tuple(situacao_equipamento),
        fases_instrumento=tuple(fase_instrumento or ()),
    )
    rotulo = _ROTULO_ARQUIVO.get(tipo_relatorio, tipo_relatorio)
    nome_arquivo = montar_nome_arquivo(rotulo, filtro, nivel, formato)
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


class PreviaRelatorio(BaseModel):
    colunas: tuple[str, ...]
    linhas: list[tuple[Celula, ...]]
    total: int
    total_linhas: int
    unidade: str


@router.get("/previa", response_model=PreviaRelatorio)
def consultar_monitorados(
    tipo_relatorio: TipoMonitorado | Literal["instrumentos_repasse"],
    filtro: FiltroRelatorio = Depends(),
    nivel: Literal["simplificado", "completo"] = "simplificado",
    situacao_equipamento: list[SituacaoEquipamento] = Query(default=[]),
    pagina: int = Query(default=1, ge=1),
    limite: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
    fase_instrumento: Annotated[list[FaseAcompanhamento] | None, Query()] = None,
) -> PreviaRelatorio:
    filtro.validar_referencia_do_periodo()
    if tipo_relatorio == "instrumentos_repasse":
        total, propostas = previa_propostas(db=db, filtro=filtro, pagina=pagina, limite=limite)
        return PreviaRelatorio(
            colunas=("Proposta", "Proponente"),
            linhas=[tuple(linha) for linha in propostas],
            total=total,
            total_linhas=total,
            unidade="propostas",
        )
    relatorio = montar_relatorio_monitorado(
        db=db,
        tipo=tipo_relatorio,
        nivel=nivel,
        filtro=filtro,
        situacoes=tuple(situacao_equipamento),
        fases=tuple(fase_instrumento or ()),
    )
    inicio = (pagina - 1) * limite
    return PreviaRelatorio(
        colunas=relatorio.colunas,
        linhas=relatorio.linhas[inicio : inicio + limite],
        total=relatorio.total,
        total_linhas=len(relatorio.linhas),
        unidade=relatorio.unidade,
    )
