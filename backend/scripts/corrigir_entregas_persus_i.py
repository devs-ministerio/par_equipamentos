"""PERSUS I: a data de entrega de todo item é a data de inauguração.

Para cada instrumento PERSUS I com inauguração **realizada** (marco `cronograma_previsao_inauguracao` ativo com
`data_ocorrencia`):

- entrega ativa com data diferente: a data é corrigida para a da inauguração, com `AuditLog` antes/depois (mesmo
  critério de `corrigir_unidade`). Não se exclui e relança porque o número de série da unidade é único no item,
  inclusive entre entregas excluídas;
- sem entrega ativa: cria uma entrega com a data da inauguração e as unidades que faltam dos itens controlados
  (planejado menos entregue menos cancelado). Instrumento sem item controlado ou com quantidade desconhecida é
  listado e fica de fora.

Instrumento com conclusão ativa não é tocado. Idempotente. Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.corrigir_entregas_persus_i
    python -m scripts.corrigir_entregas_persus_i --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import date

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import EntregaEquipamento, InstrumentoEquipamento, UnidadeEquipamento
from app.repositories import conclusoes as conclusoes_repo
from app.repositories import itens_equipamento as itens_repo
from app.repositories import monitoramento as monitoramento_repo

MARCO_INAUGURACAO = "cronograma_previsao_inauguracao"
TIPO = "PERSUS I"


def _inauguracao_realizada(db: Session, instrumento_id: int, marco_id: int) -> date | None:
    evento = monitoramento_repo.obter_evento_mais_recente_do_marco(db, instrumento_id=instrumento_id, marco_id=marco_id)
    return evento.data_ocorrencia if evento is not None else None


def _entregas_ativas(db: Session, instrumento_id: int) -> list[EntregaEquipamento]:
    return list(
        db.scalars(
            select(EntregaEquipamento)
            .where(
                EntregaEquipamento.instrumento_id == instrumento_id,
                EntregaEquipamento.deletado_em.is_(None),
                EntregaEquipamento.substituido_por_id.is_(None),
            )
            .order_by(EntregaEquipamento.id)
        )
    )


def _criar_entrega(
    db: Session, instrumento: InstrumentoEquipamento, data: date, contagem: Counter[str], *, gravar: bool
) -> None:
    itens = [item for item, _, _ in itens_repo.listar_itens_do_instrumento(db, instrumento.id) if item.controla_unidade]
    if not itens:
        contagem["sem item controlado"] += 1
        return
    if any(item.quantidade_planejada is None for item in itens):
        contagem["quantidade desconhecida"] += 1
        return
    faltas = [
        (
            item,
            (item.quantidade_planejada or 0)
            - itens_repo.quantidade_cancelada(db, item.id)
            - itens_repo.quantidade_entregue(db, item.id),
        )
        for item in itens
    ]
    faltas = [(item, falta) for item, falta in faltas if falta > 0]
    if not faltas:
        contagem["sem unidade a entregar"] += 1
        return
    if not gravar:
        contagem["entrega a criar"] += 1
        return
    entrega = EntregaEquipamento(
        instrumento_id=instrumento.id,
        evento_id=None,
        data_ocorrencia=data,
        observacao="Entrega igual à inauguração (PERSUS I)",
        autor_id=None,
        chave_idempotencia=f"migracao-persus-i-{instrumento.id}",
    )
    itens_repo.adicionar(db, entrega)
    for item, falta in faltas:
        ordem = itens_repo.proxima_ordem(db, item.id)
        for posicao in range(falta):
            itens_repo.adicionar(db, UnidadeEquipamento(entrega_id=entrega.id, item_id=item.id, ordem=ordem + posicao))
    log_action(
        db,
        user_id=None,
        entity_name="entrega_equipamento",
        entity_id=entrega.id,
        action="created",
        details={"nr_convenio": instrumento.nr_convenio, "origem": "migracao_persus_i", "data": data.isoformat()},
    )
    contagem["entrega criada"] += 1


def executar(db: Session, *, aplicar: bool) -> Counter[str]:
    contagem: Counter[str] = Counter()
    marco = monitoramento_repo.obter_marco_por_codigo(db, MARCO_INAUGURACAO)
    if marco is None:
        raise RuntimeError("Marco de inauguração não encontrado no catálogo.")
    instrumentos = db.scalars(
        select(InstrumentoEquipamento)
        .where(InstrumentoEquipamento.tipo_contratacao == TIPO)
        .order_by(InstrumentoEquipamento.id)
    ).all()
    for instrumento in instrumentos:
        if conclusoes_repo.existe_ativa(db, instrumento.id):
            contagem["concluído (não tocado)"] += 1
            continue
        data = _inauguracao_realizada(db, instrumento.id, marco.id)
        if data is None:
            contagem["sem inauguração realizada"] += 1
            continue
        entregas = _entregas_ativas(db, instrumento.id)
        if not entregas:
            _criar_entrega(db, instrumento, data, contagem, gravar=aplicar)
            continue
        divergentes = [e for e in entregas if e.data_ocorrencia != data]
        if not divergentes:
            contagem["já correta"] += 1
            continue
        contagem["data corrigida" if aplicar else "data a corrigir"] += len(divergentes)
        if not aplicar:
            continue
        for entrega in divergentes:
            antes = entrega.data_ocorrencia
            entrega.data_ocorrencia = data
            log_action(
                db,
                user_id=None,
                entity_name="entrega_equipamento",
                entity_id=entrega.id,
                action="data_corrigida_inauguracao_persus_i",
                details={
                    "nr_convenio": instrumento.nr_convenio,
                    "antes": antes.isoformat(),
                    "depois": data.isoformat(),
                },
            )
    return contagem


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
        contagem = executar(db, aplicar=args.aplicar)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    print("Entregas gravadas." if args.aplicar else "Simulação: nada foi alterado.")
    for rotulo, n in contagem.most_common():
        print(f"  {rotulo}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
