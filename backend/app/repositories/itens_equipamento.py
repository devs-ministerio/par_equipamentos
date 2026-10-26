"""Consultas de item planejado, entrega e unidade de equipamento. Não commita."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    EntregaEquipamento,
    EntregaLegadaRevisao,
    EquipamentoCatalogo,
    EventoMarco,
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    ItemPlano,
    RenemItem,
    UnidadeEquipamento,
)

_ENTREGA_ATIVA = (EntregaEquipamento.deletado_em.is_(None), EntregaEquipamento.substituido_por_id.is_(None))


def _nome_renem_vigente():
    """Nome oficial do código na versão mais recente da RENEM carregada."""
    return (
        select(RenemItem.nome)
        .where(RenemItem.codigo_item == ItemPlano.codigo_item)
        .order_by(RenemItem.versao_lista.desc())
        .limit(1)
        .correlate(ItemPlano)
        .scalar_subquery()
    )


def listar_itens_do_instrumento(db: Session, instrumento_id: int) -> list[tuple[ItemPlano, str | None, str | None]]:
    """Itens ativos do instrumento com a família do catálogo e o nome oficial na RENEM (quando houver)."""
    return [
        (item, familia, nome_renem)
        for item, familia, nome_renem in db.execute(
            select(ItemPlano, EquipamentoCatalogo.codigo, _nome_renem_vigente())
            .outerjoin(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
            .where(ItemPlano.instrumento_id == instrumento_id, ItemPlano.ativo.is_(True))
            .order_by(ItemPlano.id)
        ).all()
    ]


def travar_itens(db: Session, ids: list[int]) -> dict[int, ItemPlano]:
    """Bloqueia as linhas dos itens (ordem estável) para serializar entregas concorrentes do mesmo item."""
    linhas = db.execute(select(ItemPlano).where(ItemPlano.id.in_(ids)).order_by(ItemPlano.id).with_for_update())
    return {item.id: item for item in linhas.scalars()}


def listar_unidades_ativas(db: Session, item_ids: list[int]) -> list[tuple[UnidadeEquipamento, date]]:
    if not item_ids:
        return []
    return [
        (unidade, data)
        for unidade, data in db.execute(
            select(UnidadeEquipamento, EntregaEquipamento.data_ocorrencia)
            .join(EntregaEquipamento, EntregaEquipamento.id == UnidadeEquipamento.entrega_id)
            .where(UnidadeEquipamento.item_id.in_(item_ids), *_ENTREGA_ATIVA)
            .order_by(UnidadeEquipamento.item_id, UnidadeEquipamento.ordem)
        ).all()
    ]


def quantidade_entregue(db: Session, item_id: int) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(UnidadeEquipamento)
            .join(EntregaEquipamento, EntregaEquipamento.id == UnidadeEquipamento.entrega_id)
            .where(UnidadeEquipamento.item_id == item_id, *_ENTREGA_ATIVA)
        ).scalar_one()
    )


def proxima_ordem(db: Session, item_id: int) -> int:
    """Ordem conta também unidades de entregas excluídas: `(item_id, ordem)` é único."""
    atual = db.execute(
        select(func.max(UnidadeEquipamento.ordem)).where(UnidadeEquipamento.item_id == item_id)
    ).scalar_one()
    return int(atual or 0) + 1


def series_existentes(db: Session, item_id: int, series: list[str]) -> set[str]:
    if not series:
        return set()
    return {
        serie
        for serie in db.execute(
            select(UnidadeEquipamento.numero_serie).where(
                UnidadeEquipamento.item_id == item_id, UnidadeEquipamento.numero_serie.in_(series)
            )
        ).scalars()
        if serie is not None
    }


def obter_entrega_por_chave(db: Session, chave: str) -> EntregaEquipamento | None:
    return db.execute(
        select(EntregaEquipamento).where(EntregaEquipamento.chave_idempotencia == chave)
    ).scalar_one_or_none()


def obter_entrega(db: Session, entrega_id: int) -> EntregaEquipamento | None:
    return db.get(EntregaEquipamento, entrega_id)


def obter_unidade(db: Session, unidade_id: int) -> UnidadeEquipamento | None:
    return db.get(UnidadeEquipamento, unidade_id)


def unidades_da_entrega(db: Session, entrega: EntregaEquipamento) -> list[UnidadeEquipamento]:
    return list(
        db.execute(
            select(UnidadeEquipamento)
            .where(UnidadeEquipamento.entrega_id == entrega.id)
            .order_by(UnidadeEquipamento.item_id, UnidadeEquipamento.ordem)
        ).scalars()
    )


def adicionar(db: Session, *objetos: object) -> None:
    db.add_all(objetos)
    db.flush()


def contar_revisoes_pendentes(db: Session, instrumento_id: int) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(EntregaLegadaRevisao)
            .where(EntregaLegadaRevisao.instrumento_id == instrumento_id, EntregaLegadaRevisao.situacao == "pendente")
        ).scalar_one()
    )


def listar_revisoes_pendentes(
    db: Session, *, usuario_id: int | None
) -> list[tuple[EntregaLegadaRevisao, str, date | None]]:
    """`usuario_id=None` devolve todas (gestor/admin); com id, só dos instrumentos em que é titular/suplente."""
    consulta = (
        select(EntregaLegadaRevisao, InstrumentoEquipamento.nr_convenio, EventoMarco.data_ocorrencia)
        .join(InstrumentoEquipamento, InstrumentoEquipamento.id == EntregaLegadaRevisao.instrumento_id)
        .join(EventoMarco, EventoMarco.id == EntregaLegadaRevisao.evento_id)
        .where(EntregaLegadaRevisao.situacao == "pendente")
        .order_by(EntregaLegadaRevisao.id)
    )
    if usuario_id is not None:
        consulta = consulta.where(
            EntregaLegadaRevisao.instrumento_id.in_(
                select(InstrumentoResponsavel.instrumento_id).where(InstrumentoResponsavel.usuario_id == usuario_id)
            )
        )
    return [(r, nr, data) for r, nr, data in db.execute(consulta).all()]


def obter_revisao(db: Session, revisao_id: int) -> EntregaLegadaRevisao | None:
    return db.get(EntregaLegadaRevisao, revisao_id, with_for_update=True)


def unidades_entregues_por_instrumento(db: Session, instrumento_ids: set[int]) -> dict[int, int]:
    """Unidades entregues, só dos instrumentos que têm item controlado por unidade (0 quando nada foi entregue)."""
    if not instrumento_ids:
        return {}
    controlados = set(
        db.execute(
            select(ItemPlano.instrumento_id).where(
                ItemPlano.instrumento_id.in_(instrumento_ids),
                ItemPlano.controla_unidade.is_(True),
                ItemPlano.ativo.is_(True),
            )
        ).scalars()
    )
    entregues = {
        int(instrumento): int(total)
        for instrumento, total in db.execute(
            select(EntregaEquipamento.instrumento_id, func.count(UnidadeEquipamento.id))
            .join(UnidadeEquipamento, UnidadeEquipamento.entrega_id == EntregaEquipamento.id)
            .where(EntregaEquipamento.instrumento_id.in_(controlados), *_ENTREGA_ATIVA)
            .group_by(EntregaEquipamento.instrumento_id)
        ).all()
    }
    return {i: entregues.get(i, 0) for i in controlados if i is not None}


ROTULO_FAMILIA_POR_VALOR = "Outros equipamentos (a partir de R$ 300 mil)"


def resumo_por_instrumento_e_familia(db: Session, instrumento_ids: set[int]) -> list[tuple[int, str, int, int]]:
    """(instrumento, família, planejado, entregue) dos itens controlados; planejado desconhecido não soma.

    Item controlado por valor, sem família no catálogo, vai para `ROTULO_FAMILIA_POR_VALOR`."""
    if not instrumento_ids:
        return []
    familia = func.coalesce(EquipamentoCatalogo.nome, ROTULO_FAMILIA_POR_VALOR)
    planejado = {
        (int(i), str(f)): int(q)
        for i, f, q in db.execute(
            select(ItemPlano.instrumento_id, familia, func.coalesce(func.sum(ItemPlano.quantidade_planejada), 0))
            .outerjoin(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
            .where(
                ItemPlano.instrumento_id.in_(instrumento_ids),
                ItemPlano.controla_unidade.is_(True),
                ItemPlano.ativo.is_(True),
            )
            .group_by(ItemPlano.instrumento_id, familia)
        ).all()
    }
    entregue = {
        (int(i), str(f)): int(q)
        for i, f, q in db.execute(
            select(ItemPlano.instrumento_id, familia, func.count(UnidadeEquipamento.id))
            .join(UnidadeEquipamento, UnidadeEquipamento.item_id == ItemPlano.id)
            .join(EntregaEquipamento, EntregaEquipamento.id == UnidadeEquipamento.entrega_id)
            .outerjoin(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
            .where(ItemPlano.instrumento_id.in_(instrumento_ids), *_ENTREGA_ATIVA)
            .group_by(ItemPlano.instrumento_id, familia)
        ).all()
    }
    return [
        (i, f, planejado.get((i, f), 0), entregue.get((i, f), 0)) for i, f in sorted(set(planejado) | set(entregue))
    ]
