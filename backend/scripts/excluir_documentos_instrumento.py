"""Exclusão (soft delete com motivo) de documentos de um instrumento lançados por engano.

Nada é apagado: o documento ganha `deletado_em` e `motivo_exclusao`, e fica `AuditLog` por documento.
Sem `--aplicar` apenas simula.

Uso:
    python -m scripts.excluir_documentos_instrumento --instrumento 825374 --tipo cnen_licenca --motivo "..."
    python -m scripts.excluir_documentos_instrumento --instrumento 825374 --tipo cnen_licenca --motivo "..." \\
        --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from typing import get_args

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import DocumentoInstrumento, InstrumentoEquipamento
from app.schemas_documentos import TipoDocumento


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--instrumento", required=True, help="nº do instrumento (nr_convenio)")
    analisador.add_argument("--tipo", required=True, choices=get_args(TipoDocumento))
    analisador.add_argument("--motivo", required=True, help="motivo da exclusão (mín. 5 caracteres)")
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)
    if len(args.motivo.strip()) < 5:
        raise SystemExit("Motivo curto demais.")

    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    with SessionLocal() as db:
        instrumento = db.scalar(
            select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == args.instrumento)
        )
        if instrumento is None:
            raise SystemExit(f"Instrumento {args.instrumento} não encontrado.")
        documentos = list(
            db.scalars(
                select(DocumentoInstrumento).where(
                    DocumentoInstrumento.instrumento_id == instrumento.id,
                    DocumentoInstrumento.tipo == args.tipo,
                    DocumentoInstrumento.deletado_em.is_(None),
                    DocumentoInstrumento.substituido_por_id.is_(None),
                )
            )
        )
        for d in documentos:
            print(f"  {d.tipo} id={d.id} nº={d.numero or '-'} data={d.data_documento}")
            if args.aplicar:
                d.deletado_em = datetime.now(timezone.utc)
                d.motivo_exclusao = args.motivo.strip()
                log_action(
                    db,
                    user_id=None,
                    entity_name="documento_instrumento",
                    entity_id=d.id,
                    action="excluir_documento_indevido",
                    details={"instrumento": args.instrumento, "tipo": d.tipo, "motivo": args.motivo.strip()},
                )
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    print(("Excluídos: " if args.aplicar else "Simulação, a excluir: ") + str(len(documentos)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
