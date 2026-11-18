"""Cria os documentos do instrumento (OS, TRP, TRD, SCRA e licença da CNEN) a partir dos marcos antigos.

- Só migra evento ativo com data de ocorrência; previsão sem data realizada é descartada.
- Os eventos antigos não são alterados nem excluídos.
- Idempotente: repetir não duplica (chave `origem_evento_id`).

Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.migrar_marcos_para_documentos
    python -m scripts.migrar_marcos_para_documentos --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse

from sqlalchemy.engine import make_url

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.services.migracao_documentos import migrar


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
        contagem = migrar(db, aplicar=args.aplicar)
        if args.aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="documento_instrumento",
                entity_id=0,
                action="migrar_marcos_para_documentos",
                details=dict(contagem),
            )
            db.commit()
        else:
            db.rollback()
    print("Documentos gravados." if args.aplicar else "Simulação: nada foi alterado.")
    for rotulo, n in sorted(contagem.items()):
        print(f"  {rotulo}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
