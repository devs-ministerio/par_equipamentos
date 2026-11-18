"""Previsão de entrega por item do plano (não é a previsão de inauguração do instrumento).

Uma previsão ativa por item. Alterar cria nova linha e aponta a antiga por `substituido_por_id`; remover é soft
delete com motivo. Só item controlado por unidade e ainda com unidade a entregar. Autorização por titularidade
do instrumento e `AuditLog` em toda escrita.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento
from app.db.models import InstrumentoEquipamento, ItemPlano, PrevisaoEntregaItem, User
from app.domain_errors import NotFoundError, ValidationError
from app.repositories import itens_equipamento as repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.schemas_entregas import PrevisaoEntregaCreate, PrevisaoEntregaRead, PrevisaoEntregaRemocao


def _ler(previsao: PrevisaoEntregaItem) -> PrevisaoEntregaRead:
    return PrevisaoEntregaRead(
        id=previsao.id,
        item_id=previsao.item_id,
        data_prevista=previsao.data_prevista,
        ativo=previsao.substituido_por_id is None and previsao.deletado_em is None,
    )


def _item_e_instrumento(db: Session, item_id: int, usuario: User) -> tuple[ItemPlano, InstrumentoEquipamento]:
    item = repo.travar_itens(db, [item_id]).get(item_id)
    if item is None or not item.ativo or item.instrumento_id is None:
        raise NotFoundError("Item não encontrado.")
    instrumento = db.get(InstrumentoEquipamento, item.instrumento_id)
    if instrumento is None:
        raise NotFoundError("Item não encontrado.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    return item, instrumento


def definir_previsao_entrega(
    *, item_id: int, dados: PrevisaoEntregaCreate, db: Session, usuario: User
) -> PrevisaoEntregaRead:
    item, instrumento = _item_e_instrumento(db, item_id, usuario)
    if not item.controla_unidade:
        raise ValidationError("O item não é controlado por unidade.")
    if item.quantidade_planejada is not None:
        a_entregar = (
            item.quantidade_planejada - repo.quantidade_entregue(db, item.id) - repo.quantidade_cancelada(db, item.id)
        )
        if a_entregar <= 0:
            raise ValidationError("O item não tem unidade pendente de entrega.")
    atual = repo.obter_previsao_ativa(db, item.id)
    if atual is not None and atual.data_prevista == dados.data_prevista:
        return _ler(atual)
    nova = PrevisaoEntregaItem(item_id=item.id, data_prevista=dados.data_prevista, autor_id=usuario.id)
    if atual is not None:
        # A antiga sai da condição "ativa" antes da nova entrar, para respeitar o índice único parcial.
        atual.deletado_em = datetime.now(timezone.utc)
        atual.deletado_por_id = usuario.id
        atual.motivo_exclusao = "Substituída por nova previsão."
        db.flush()
    repo.adicionar(db, nova)
    if atual is not None:
        atual.substituido_por_id = nova.id
    log_action(
        db,
        user_id=usuario.id,
        entity_name="previsao_entrega_item",
        entity_id=nova.id,
        action="created",
        details={
            "nr_convenio": instrumento.nr_convenio,
            "item_id": item.id,
            "data_prevista": dados.data_prevista.isoformat(),
            "anterior": atual.data_prevista.isoformat() if atual is not None else None,
        },
    )
    db.commit()
    return _ler(nova)


def remover_previsao_entrega(
    *, item_id: int, dados: PrevisaoEntregaRemocao, db: Session, usuario: User
) -> PrevisaoEntregaRead:
    item, instrumento = _item_e_instrumento(db, item_id, usuario)
    atual = repo.obter_previsao_ativa(db, item.id)
    if atual is None:
        raise NotFoundError("O item não tem previsão de entrega.")
    atual.deletado_em = datetime.now(timezone.utc)
    atual.deletado_por_id = usuario.id
    atual.motivo_exclusao = dados.motivo.strip()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="previsao_entrega_item",
        entity_id=atual.id,
        action="deleted",
        details={"nr_convenio": instrumento.nr_convenio, "item_id": item.id, "motivo": dados.motivo.strip()},
    )
    db.commit()
    return _ler(atual)
