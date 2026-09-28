"""Completa ano de convênios sem número de instrumento pela publicação oficial."""

from __future__ import annotations

import argparse

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio


def executar(*, dry_run: bool) -> dict[str, int]:
    db = SessionLocal()
    try:
        convenios = db.execute(
            select(Convenio).where(
                Convenio.tipo_contratacao == "Convênio",
                Convenio.ano_instrumento.is_(None),
                Convenio.data_publicacao.is_not(None),
            )
        ).scalars()
        atualizados = 0
        for convenio in convenios:
            # Garantido pelo filtro `data_publicacao.is_not(None)` acima --
            # mypy não estreita Optional a partir de filtro SQL.
            assert convenio.data_publicacao is not None
            convenio.ano_instrumento = convenio.data_publicacao.year
            atualizados += 1
        if dry_run:
            db.rollback()
        else:
            db.commit()
        return {"convenios": atualizados}
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(executar(dry_run=args.dry_run))
