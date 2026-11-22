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
    CancelamentoUnidadeCreate,
    CancelamentoUnidadeRead,
    CorrecaoDataEntrega,
    EntregaCreate,
    EntregaRead,
    EquipamentosInstrumentoRead,
    ExclusaoEntrega,
    PrevisaoEntregaCreate,
    PrevisaoEntregaRead,
    PrevisaoEntregaRemocao,
    ReativacaoUnidadeCreate,
    UnidadeRead,
    UnidadeUpdate,
)
from app.services import cancelamento_unidade as servico_cancelamento
from app.services import entregas_equipamento as servico
from app.services import previsoes_entrega as servico_previsao

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


@router.patch("/entregas/{entrega_id}/data", response_model=EntregaRead)
def corrigir_data_entrega(
    entrega_id: int,
    corpo: CorrecaoDataEntrega,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.corrigir_data_entrega(entrega_id=entrega_id, dados=corpo, db=db, usuario=usuario)


@router.delete("/entregas/{entrega_id}", response_model=EntregaRead)
def excluir_entrega(
    entrega_id: int,
    corpo: ExclusaoEntrega,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico.excluir_entrega(entrega_id=entrega_id, motivo=corpo.motivo, db=db, usuario=usuario)


@router.post("/itens/{item_id}/cancelamentos", response_model=CancelamentoUnidadeRead, status_code=201)
def cancelar_unidade_planejada(
    item_id: int,
    corpo: CancelamentoUnidadeCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico_cancelamento.cancelar_unidade_planejada(item_id=item_id, dados=corpo, db=db, usuario=usuario)


@router.delete("/cancelamentos/{cancelamento_id}", response_model=CancelamentoUnidadeRead)
def reativar_unidade_cancelada(
    cancelamento_id: int,
    corpo: ReativacaoUnidadeCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico_cancelamento.reativar_unidade_cancelada(
        cancelamento_id=cancelamento_id, dados=corpo, db=db, usuario=usuario
    )


@router.put("/itens/{item_id}/previsao-entrega", response_model=PrevisaoEntregaRead)
def definir_previsao_entrega(
    item_id: int,
    corpo: PrevisaoEntregaCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico_previsao.definir_previsao_entrega(item_id=item_id, dados=corpo, db=db, usuario=usuario)


@router.delete("/itens/{item_id}/previsao-entrega", response_model=PrevisaoEntregaRead)
def remover_previsao_entrega(
    item_id: int,
    corpo: PrevisaoEntregaRemocao,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    return servico_previsao.remover_previsao_entrega(item_id=item_id, dados=corpo, db=db, usuario=usuario)
