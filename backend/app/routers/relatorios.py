"""Geração de relatórios Excel/Word -- Plan Mode docs/arquitetura/
planmode-relatorios-2026-09-25.md, Blocos 2 e 4.

GET (não POST): é leitura sem mudança de estado -- evita exigir o header
CSRF (`app/main.py::csrf_middleware` só cobre POST/PUT/PATCH/DELETE) só
pra viabilizar um download, e mantém o padrão já usado pelo resto da API.
Atrás de `require_current_user`, mesmo gate do resto do app.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.services.relatorios import FiltroRelatorio, montar_relatorio

router = APIRouter(prefix="/relatorios", tags=["relatorios"])

_MEDIA_TYPE = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@router.get("")
def gerar_relatorio(
    formato: Literal["xlsx", "docx"],
    tipo_relatorio: Literal["instrumentos_repasse", "analise_merito"] = "instrumentos_repasse",
    nivel: Literal["simplificado", "completo"] = "simplificado",
    escopo: Literal["brasil", "regiao", "uf", "municipio", "cnes"] = "brasil",
    regiao: str | None = Query(default=None),
    uf: str | None = Query(default=None),
    municipio: str | None = Query(default=None),
    cnes: str | None = Query(default=None),
    ano: int | None = Query(default=None),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> StreamingResponse:
    filtro = FiltroRelatorio(escopo=escopo, regiao=regiao, uf=uf, municipio=municipio, cnes=cnes, ano=ano)
    conteudo = montar_relatorio(db=db, formato=formato, nivel=nivel, tipo_relatorio=tipo_relatorio, filtro=filtro)
    nome_arquivo = f"relatorio-{tipo_relatorio}-{escopo}-{nivel}.{formato}"
    return StreamingResponse(
        iter([conteudo]),
        media_type=_MEDIA_TYPE[formato],
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo}"'},
    )
