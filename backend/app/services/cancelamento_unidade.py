"""Cancelamento de unidade planejada de item ainda não entregue.

A unidade física só nasce na entrega, então cancelar é tirar uma unidade da quantidade a entregar do item.
Append-only: cada cancelamento é uma linha; desfazer é soft delete com motivo. Autorização por titularidade
do instrumento e `AuditLog` em toda escrita.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento
from app.db.models import CancelamentoUnidadePlanejada, InstrumentoEquipamento, ItemPlano, User
from app.domain_errors import ConflictError, NotFoundError, ValidationError
from app.repositories import itens_equipamento as repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.schemas_entregas import CancelamentoUnidadeCreate, CancelamentoUnidadeRead, ReativacaoUnidadeCreate
from app.services.conclusao_acompanhamento import assert_nao_concluido


def _ler(cancelamento: CancelamentoUnidadePlanejada) -> CancelamentoUnidadeRead:
    return CancelamentoUnidadeRead(
        id=cancelamento.id,
        item_id=cancelamento.item_id,
        motivo=cancelamento.motivo,
        criado_em=cancelamento.criado_em,
        ativo=cancelamento.deletado_em is None,
    )


def _instrumento_do_item(db: Session, item: ItemPlano) -> InstrumentoEquipamento:
    if item.instrumento_id is None:
        raise NotFoundError("Item não encontrado.")
    instrumento = db.get(InstrumentoEquipamento, item.instrumento_id)
    if instrumento is None:
        raise NotFoundError("Item não encontrado.")
    return instrumento


def cancelar_unidade_planejada(
    *, item_id: int, dados: CancelamentoUnidadeCreate, db: Session, usuario: User
) -> CancelamentoUnidadeRead:
    item = repo.travar_itens(db, [item_id]).get(item_id)
    if item is None or not item.ativo:
        raise NotFoundError("Item não encontrado.")
    instrumento = _instrumento_do_item(db, item)
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    assert_nao_concluido(db, instrumento.id)
    if not item.controla_unidade or item.quantidade_planejada is None:
        raise ValidationError("O item não tem quantidade planejada controlada por unidade.")
    pendentes = (
        item.quantidade_planejada - repo.quantidade_entregue(db, item.id) - repo.quantidade_cancelada(db, item.id)
    )
    if pendentes <= 0:
        raise ValidationError("O item não tem unidade pendente para cancelar.")
    cancelamento = CancelamentoUnidadePlanejada(item_id=item.id, motivo=dados.motivo.strip(), autor_id=usuario.id)
    repo.adicionar(db, cancelamento)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="cancelamento_unidade_planejada",
        entity_id=cancelamento.id,
        action="created",
        details={"nr_convenio": instrumento.nr_convenio, "item_id": item.id, "motivo": cancelamento.motivo},
    )
    db.commit()
    return _ler(cancelamento)


def reativar_unidade_cancelada(
    *, cancelamento_id: int, dados: ReativacaoUnidadeCreate, db: Session, usuario: User
) -> CancelamentoUnidadeRead:
    cancelamento = repo.obter_cancelamento(db, cancelamento_id)
    if cancelamento is None:
        raise NotFoundError("Cancelamento não encontrado.")
    item = repo.travar_itens(db, [cancelamento.item_id])[cancelamento.item_id]
    instrumento = _instrumento_do_item(db, item)
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    assert_nao_concluido(db, instrumento.id)
    db.refresh(cancelamento)  # relê depois da trava
    if cancelamento.deletado_em is not None:
        raise ConflictError("Este cancelamento já foi desfeito.")
    cancelamento.deletado_em = datetime.now(timezone.utc)
    cancelamento.deletado_por_id = usuario.id
    cancelamento.motivo_exclusao = dados.motivo.strip()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="cancelamento_unidade_planejada",
        entity_id=cancelamento.id,
        action="deleted",
        details={"nr_convenio": instrumento.nr_convenio, "item_id": item.id, "motivo": dados.motivo.strip()},
    )
    db.commit()
    return _ler(cancelamento)
