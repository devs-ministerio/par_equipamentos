"""Grava o repasse (integral ou parcial) dos instrumentos monitorados a partir do desembolso do SICONV.

- Sem desembolso, nada é gravado: o instrumento segue "Aguardando repasse".
- Integral só quando o total desembolsado cobre o repasse previsto; senão, parcial.
- Idempotente: repetir não duplica; se o tipo mudou, o registro vigente da fonte é substituído.
- A confirmação manual do técnico nunca é alterada.

Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.derivar_repasses_siconv
    python -m scripts.derivar_repasses_siconv --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import InstrumentoEquipamento
from app.repositories import repasses as repo
from app.services.repasses import derivar_repasse_da_fonte, tipo_repasse_pela_fonte


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)

    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    contagem: Counter[str] = Counter()
    with SessionLocal() as db:
        for instrumento in db.execute(select(InstrumentoEquipamento).order_by(InstrumentoEquipamento.id)).scalars():
            tipo = tipo_repasse_pela_fonte(
                valor_previsto=repo.obter_valor_repasse_previsto(db, instrumento.nr_convenio),
                desembolsos=repo.obter_desembolsos_siconv(db, instrumento.nr_convenio),
            )
            contagem[tipo or "sem desembolso"] += 1
            if args.aplicar and tipo is not None:
                derivar_repasse_da_fonte(instrumento=instrumento, db=db)
        if args.aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="repasse_instrumento",
                entity_id=0,
                action="derivar_repasses_siconv",
                details=dict(contagem),
            )
            db.commit()
        else:
            db.rollback()
    print("Repasses gravados." if args.aplicar else "Simulação: nada foi alterado.")
    for rotulo, n in contagem.most_common():
        print(f"  {rotulo}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
