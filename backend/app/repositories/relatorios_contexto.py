"""Consultas de apoio aos relatórios monitorados. Só leitura."""

from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AcaoMonitoramento, CnesEstabelecimento, Convenio, EquipamentoCatalogo, ItemPlano
from app.repositories.itens_equipamento import ROTULO_FAMILIA_POR_VALOR
from app.repositories.monitoramento import listar_acoes_por_instrumentos


def convenios_por_numero(db: Session, numeros: set[str]) -> dict[str, Convenio]:
    if not numeros:
        return {}
    return {c.numero: c for c in db.scalars(select(Convenio).where(Convenio.numero.in_(numeros)).order_by(Convenio.id))}


def nomes_cnes(db: Session, cnes: set[str]) -> dict[str, str]:
    if not cnes:
        return {}
    consulta = select(CnesEstabelecimento.cnes, CnesEstabelecimento.nome_estabelecimento).where(
        CnesEstabelecimento.cnes.in_(cnes)
    )
    return {c: n for c, n in db.execute(consulta)}


def _familia():
    return func.coalesce(EquipamentoCatalogo.nome, ROTULO_FAMILIA_POR_VALOR)


def descricoes_por_familia(db: Session, instrumento_ids: set[int]) -> dict[tuple[int, str], str]:
    if not instrumento_ids:
        return {}
    consulta = (
        select(ItemPlano.instrumento_id, _familia(), ItemPlano.descricao)
        .outerjoin(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
        .where(
            ItemPlano.instrumento_id.in_(instrumento_ids),
            ItemPlano.controla_unidade.is_(True),
            ItemPlano.ativo.is_(True),
        )
        .order_by(ItemPlano.instrumento_id, ItemPlano.id)
    )
    agrupado: dict[tuple[int, str], list[str]] = defaultdict(list)
    for instrumento, familia, descricao in db.execute(consulta):
        if descricao and descricao not in agrupado[(int(instrumento), str(familia))]:
            agrupado[(int(instrumento), str(familia))].append(descricao)
    return {chave: "; ".join(valores) for chave, valores in agrupado.items()}


def valores_por_familia(db: Session, instrumento_ids: set[int]) -> dict[tuple[int, str], tuple[float, int]]:
    """(valor total, quantidade planejada) da família, só quando TODOS os itens ativos controlados têm valor.

    Família com algum item sem preço fica de fora: o valor não é inventado nem misturado com itens de preços diferentes."""
    if not instrumento_ids:
        return {}
    consulta = (
        select(
            ItemPlano.instrumento_id,
            _familia(),
            func.sum(ItemPlano.valor_total),
            func.sum(ItemPlano.quantidade_planejada),
            func.count(ItemPlano.id),
            func.count(ItemPlano.valor_total),
        )
        .outerjoin(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
        .where(
            ItemPlano.instrumento_id.in_(instrumento_ids),
            ItemPlano.controla_unidade.is_(True),
            ItemPlano.ativo.is_(True),
        )
        .group_by(ItemPlano.instrumento_id, _familia())
    )
    return {
        (int(i), str(f)): (float(v), int(q))
        for i, f, v, q, itens, com_valor in db.execute(consulta)
        if itens == com_valor and v is not None and q
    }


def valor_unitario_por_item(db: Session, instrumento_ids: set[int]) -> dict[int, float]:
    """Valor de uma unidade de cada item (valor do item ÷ quantidade planejada); item sem preço não aparece."""
    if not instrumento_ids:
        return {}
    consulta = select(ItemPlano.id, ItemPlano.valor_total, ItemPlano.quantidade_planejada).where(
        ItemPlano.instrumento_id.in_(instrumento_ids),
        ItemPlano.ativo.is_(True),
        ItemPlano.valor_total.is_not(None),
        ItemPlano.quantidade_planejada > 0,
    )
    return {int(i): float(v) / int(q) for i, v, q in db.execute(consulta)}


def acoes_abertas(db: Session, instrumento_ids: set[int]) -> dict[int, list[AcaoMonitoramento]]:
    por_instrumento = listar_acoes_por_instrumentos(db, sorted(instrumento_ids))
    return {i: [a for a in acoes if a.data_conclusao is None] for i, acoes in por_instrumento.items()}
