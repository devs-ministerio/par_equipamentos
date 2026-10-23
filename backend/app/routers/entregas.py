"""Itens, entregas e unidades de equipamento de um instrumento monitorado.

Leitura exige usuário autenticado; mutações exigem editor e, dentro do Service, titularidade do instrumento.
O CSRF é verificado pelo middleware global.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_current_user, require_monitoramento_editor
from app.db.base import get_db
from app.db.models import User
from app.schemas_entregas import (
    EntregaCreate,
    EntregaLegadaRead,
    EntregaRead,
    EquipamentosInstrumentoRead,
    ExclusaoEntrega,
    UnidadeRead,
    UnidadeUpdate,
    VincularLegadaCreate,
)
from app.services import entregas_equipamento as servico

router = APIRouter(prefix="/monitoramento", tags=["entregas"])


@router.get("/instrumentos/{nr_convenio}/equipamentos", response_model=EquipamentosInstrumentoRead)
def listar_equipamentos(nr_convenio: str, db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    return servico.listar_equipamentos_do_instrumento(nr_convenio=nr_convenio, db=db, usuario=usuario)


@router.post("/instrumentos/{nr_convenio}/entregas", response_model=EntregaRead, status_code=201)
def registrar_entrega(
    nr_convenio: str,
    corpo: EntregaCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.registrar_entrega(nr_convenio=nr_convenio, dados=corpo, db=db, usuario=usuario)


@router.patch("/unidades/{unidade_id}", response_model=UnidadeRead)
def corrigir_unidade(
    unidade_id: int,
    corpo: UnidadeUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.corrigir_unidade(unidade_id=unidade_id, dados=corpo, db=db, usuario=usuario)


@router.delete("/entregas/{entrega_id}", response_model=EntregaRead)
def excluir_entrega(
    entrega_id: int,
    corpo: ExclusaoEntrega,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.excluir_entrega(entrega_id=entrega_id, motivo=corpo.motivo, db=db, usuario=usuario)


@router.get("/entregas-legadas", response_model=list[EntregaLegadaRead])
def listar_entregas_legadas(db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    return servico.listar_entregas_legadas(db=db, usuario=usuario)


@router.post("/entregas-legadas/{revisao_id}/vincular", response_model=EntregaRead, status_code=201)
def vincular_entrega_legada(
    revisao_id: int,
    corpo: VincularLegadaCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.vincular_entrega_legada(revisao_id=revisao_id, itens=corpo.itens, db=db, usuario=usuario)
