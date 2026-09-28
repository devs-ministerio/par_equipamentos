"""Limpa atribuições técnicas para redistribuição pelo sistema.

Por padrão só informa o escopo. A aplicação exige a referência do backup
confirmado e executa uma única transação: remove vínculos relacionais,
limpa os espelhos textuais e registra os totais no AuditLog.
"""

from __future__ import annotations

import argparse
import json

from sqlalchemy import delete, func, select, update

from app.audit import log_action
from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento, InstrumentoResponsavel


def executar(*, aplicar: bool, backup_reference: str | None) -> dict[str, int | bool]:
    if aplicar and not backup_reference:
        raise ValueError("--apply exige --backup-reference com backup Neon confirmado.")

    with SessionLocal() as db:
        instrumentos = db.execute(select(func.count()).select_from(InstrumentoEquipamento)).scalar_one()
        vinculos = db.execute(select(func.count()).select_from(InstrumentoResponsavel)).scalar_one()
        espelhos = db.execute(
            select(func.count())
            .select_from(InstrumentoEquipamento)
            .where(
                InstrumentoEquipamento.tecnico_titular.is_not(None)
                | InstrumentoEquipamento.tecnico_suplente.is_not(None)
            )
        ).scalar_one()
        resultado: dict[str, int | bool] = {
            "instrumentos": instrumentos,
            "vinculos_removidos": vinculos,
            "espelhos_textuais_limpos": espelhos,
            "modo_dry_run": not aplicar,
        }
        if not aplicar:
            return resultado

        db.execute(delete(InstrumentoResponsavel))
        db.execute(update(InstrumentoEquipamento).values(tecnico_titular=None, tecnico_suplente=None))
        log_action(
            db,
            user_id=None,
            entity_name="instrumento_equipamento",
            entity_id=None,
            action="limpeza_responsaveis_para_redistribuicao",
            details={**resultado, "backup_reference": backup_reference},
        )
        db.commit()
        return resultado


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="executa a limpeza após backup confirmado")
    parser.add_argument("--backup-reference", help="nome ou ID da branch/snapshot Neon")
    args = parser.parse_args()
    print(json.dumps(executar(aplicar=args.apply, backup_reference=args.backup_reference), ensure_ascii=False))


if __name__ == "__main__":
    main()
