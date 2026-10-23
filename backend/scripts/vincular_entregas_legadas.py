"""Vincula as entregas registradas antes do controle por unidade aos itens do plano.

Para cada evento de entrega ativo (marco `cronograma_entrega` com `data_ocorrencia`) ainda sem entrega
vinculada:

- **um evento e exatamente um item controlado e ativo** no instrumento: cria `entrega_equipamento` e a unidade de
  ordem 1 com marca, modelo, série e vida útil que já estavam no instrumento. Se a quantidade planejada for maior
  que 1, só a unidade 1 existe e o item fica parcial;
- **qualquer outro caso**: não atribui nada e grava `entrega_legada_revisao` com o motivo (`varias_entregas`,
  `sem_item_controlado`, `varios_itens`, `quantidade_desconhecida`). Nunca escolhe "a primeira unidade" por conveniência.

Sem ``--aplicar`` apenas simula. Idempotente: evento que já tem entrega ou revisão é pulado.

Uso:
    python -m scripts.vincular_entregas_legadas
    python -m scripts.vincular_entregas_legadas --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import (
    EntregaEquipamento,
    EntregaLegadaRevisao,
    EventoMarco,
    InstrumentoEquipamento,
    ItemPlano,
    MarcoCatalogo,
    UnidadeEquipamento,
)

MARCO_ENTREGA = "cronograma_entrega"


@dataclass
class Resultado:
    vinculadas: int = 0
    parciais: int = 0
    ja_tratadas: int = 0
    revisoes: Counter[str] = field(default_factory=Counter)
    instrumentos_com_revisao: set[int] = field(default_factory=set)


def decidir(eventos_do_instrumento: int, itens: list[ItemPlano]) -> tuple[ItemPlano | None, str | None]:
    """(item a vincular, None) ou (None, motivo da revisão)."""
    if eventos_do_instrumento > 1:
        return None, "varias_entregas"
    if not itens:
        return None, "sem_item_controlado"
    if len(itens) > 1:
        return None, "varios_itens"
    if itens[0].quantidade_planejada is None:
        return None, "quantidade_desconhecida"
    return itens[0], None


def vincular(db: Session, *, aplicar: bool) -> Resultado:
    resultado = Resultado()
    eventos = list(
        db.execute(
            select(EventoMarco)
            .join(MarcoCatalogo, MarcoCatalogo.id == EventoMarco.marco_id)
            .where(
                MarcoCatalogo.codigo == MARCO_ENTREGA,
                EventoMarco.substituido_por_id.is_(None),
                EventoMarco.deletado_em.is_(None),
                EventoMarco.data_ocorrencia.is_not(None),
            )
            .order_by(EventoMarco.id)
        ).scalars()
    )
    por_instrumento: dict[int, list[EventoMarco]] = defaultdict(list)
    for e in eventos:
        por_instrumento[e.instrumento_id].append(e)
    tratados = set(db.execute(select(EntregaEquipamento.evento_id)).scalars()) | set(
        db.execute(select(EntregaLegadaRevisao.evento_id)).scalars()
    )
    itens_por_instrumento: dict[int, list[ItemPlano]] = defaultdict(list)
    for item in db.execute(
        select(ItemPlano).where(
            ItemPlano.controla_unidade.is_(True), ItemPlano.ativo.is_(True), ItemPlano.instrumento_id.is_not(None)
        )
    ).scalars():
        itens_por_instrumento[int(item.instrumento_id or 0)].append(item)
    instrumentos = {i.id: i for i in db.execute(select(InstrumentoEquipamento)).scalars()}

    for instrumento_id, lista in por_instrumento.items():
        for evento in lista:
            if evento.id in tratados:
                resultado.ja_tratadas += 1
                continue
            item, motivo = decidir(len(lista), itens_por_instrumento.get(instrumento_id, []))
            if item is None and motivo is not None:
                resultado.revisoes[motivo] += 1
                resultado.instrumentos_com_revisao.add(instrumento_id)
                if aplicar:
                    db.add(EntregaLegadaRevisao(instrumento_id=instrumento_id, evento_id=evento.id, motivo=motivo))
                continue
            assert item is not None and evento.data_ocorrencia is not None
            resultado.vinculadas += 1
            if (item.quantidade_planejada or 1) > 1:
                resultado.parciais += 1
            if aplicar:
                inst = instrumentos[instrumento_id]
                entrega = EntregaEquipamento(
                    instrumento_id=instrumento_id,
                    evento_id=evento.id,
                    data_ocorrencia=evento.data_ocorrencia,
                    observacao=evento.observacao,
                    autor_id=evento.autor_id,
                    chave_idempotencia=f"legado:{evento.id}",
                )
                db.add(entrega)
                db.flush()
                db.add(
                    UnidadeEquipamento(
                        entrega_id=entrega.id,
                        item_id=item.id,
                        ordem=1,
                        marca=inst.equipamento_marca,
                        modelo=inst.equipamento_modelo,
                        numero_serie=inst.equipamento_numero_serie,
                        vida_util_anos=inst.equipamento_vida_util_anos,
                    )
                )
    return resultado


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)

    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    with SessionLocal() as db:
        r = vincular(db, aplicar=args.aplicar)
        if args.aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="entrega_equipamento",
                entity_id=0,
                action="vincular_entregas_legadas",
                details={"vinculadas": r.vinculadas, "revisoes": dict(r.revisoes)},
            )
            db.commit()
        else:
            db.rollback()
    print("Entregas gravadas." if args.aplicar else "Simulação: nada foi alterado.")
    print(f"  vinculadas {r.vinculadas} (parciais: {r.parciais}); já tratadas {r.ja_tratadas}")
    print(f"  para revisão: {dict(r.revisoes)}; instrumentos com aviso: {len(r.instrumentos_com_revisao)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
