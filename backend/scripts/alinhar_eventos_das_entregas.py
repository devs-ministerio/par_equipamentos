"""Alinha o evento `cronograma_entrega` de cada entrega ativa à data da entrega (a entrega é a fonte da verdade).

Para cada entrega ativa:

- evento correto: nada a fazer (se a cadeia de correções apontar para outro registro, só reaponta);
- evento ativo com outra data: corrige o evento para a data da entrega (append-only);
- evento excluído: recria o evento com a data da entrega;
- entrega sem evento (histórico migrado): não toca.

Idempotente. Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.alinhar_eventos_das_entregas
    python -m scripts.alinhar_eventos_das_entregas --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import EntregaEquipamento
from app.services.entregas_equipamento import alinhar_evento_da_entrega, evento_ativo_da_entrega

OBSERVACAO = "Alinhado à data da entrega de equipamento."


def executar(db: Session, *, aplicar: bool) -> Counter[str]:
    contagem: Counter[str] = Counter()
    entregas = db.scalars(
        select(EntregaEquipamento).where(EntregaEquipamento.deletado_em.is_(None)).order_by(EntregaEquipamento.id)
    ).all()
    for entrega in entregas:
        if entrega.evento_id is None:
            contagem["sem evento: não toca"] += 1
            continue
        ativo = evento_ativo_da_entrega(db, entrega)
        if ativo is not None and ativo.data_ocorrencia == entrega.data_ocorrencia and ativo.id == entrega.evento_id:
            contagem["já alinhada"] += 1
            continue
        if ativo is None:
            rotulo = "evento excluído: recriar"
        elif ativo.data_ocorrencia != entrega.data_ocorrencia:
            rotulo = "data diferente: corrigir evento"
        else:
            rotulo = "evento substituído: reapontar"
        contagem[rotulo if not aplicar else rotulo + " (feito)"] += 1
        if not aplicar:
            continue
        evento = alinhar_evento_da_entrega(db, entrega, autor=None, observacao=OBSERVACAO)
        log_action(
            db,
            user_id=None,
            entity_name="entrega_equipamento",
            entity_id=entrega.id,
            action="updated",
            details={
                "origem": "alinhar_eventos_das_entregas",
                "acao": rotulo,
                "evento_id": evento.id if evento else None,
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
    print("Eventos alinhados." if args.aplicar else "Simulação: nada foi alterado.")
    for rotulo, n in contagem.most_common():
        print(f"  {rotulo}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
