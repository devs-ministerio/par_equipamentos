"""Backfill idempotente de município normalizado e IBGE municipal.

Preserva as colunas de origem. Use ``--apply --backup-reference <branch>``
somente após confirmar o backup no Neon.
"""

from __future__ import annotations

import argparse
import json
from typing import cast

from sqlalchemy import select

from app.audit import log_action
from app.db.base import SessionLocal
from app.db.models import Convenio, InstrumentoEquipamento, PropostaCandidata
from app.pipeline.texto import normalizar_texto


def _ibge_municipal(valor: str | None) -> str | None:
    digitos = "".join(c for c in valor or "" if c.isdigit())
    return digitos[:6] if len(digitos) in {6, 7} else None


def executar(*, aplicar: bool, backup_reference: str | None) -> dict[str, int | bool]:
    if aplicar and not backup_reference:
        raise ValueError("--apply exige --backup-reference com backup Neon confirmado.")
    with SessionLocal() as db:
        totais = {"convenio": 0, "instrumento_equipamento": 0, "proposta_candidata": 0, "ibge_municipal": 0}
        for modelo, chave in (
            (Convenio, "convenio"),
            (InstrumentoEquipamento, "instrumento_equipamento"),
            (PropostaCandidata, "proposta_candidata"),
        ):
            for item in db.execute(select(modelo)).scalars():
                item = cast(Convenio | InstrumentoEquipamento | PropostaCandidata, item)
                normalizado = normalizar_texto(item.municipio) or None
                if item.municipio_normalizado != normalizado:
                    totais[chave] += 1
                    if aplicar:
                        item.municipio_normalizado = normalizado
        for convenio in db.execute(select(Convenio)).scalars():
            codigo = _ibge_municipal(convenio.codigo_ibge)
            if convenio.codigo_ibge_municipio != codigo:
                totais["ibge_municipal"] += 1
                if aplicar:
                    convenio.codigo_ibge_municipio = codigo
        resultado: dict[str, int | bool] = {**totais, "modo_dry_run": not aplicar}
        if aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="database",
                entity_id=None,
                action="normalizacao_municipio_ibge",
                details={**resultado, "backup_reference": backup_reference},
            )
            db.commit()
        return resultado


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-reference")
    args = parser.parse_args()
    print(json.dumps(executar(aplicar=args.apply, backup_reference=args.backup_reference), ensure_ascii=False))


if __name__ == "__main__":
    main()
