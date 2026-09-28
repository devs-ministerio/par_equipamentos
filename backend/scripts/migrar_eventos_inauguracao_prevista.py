"""Converte inaugurações futuras lançadas como ocorrência em previsão.

Uso seguro (simulação padrão):

    uv run python -m scripts.migrar_eventos_inauguracao_prevista --dry-run

Aplicação exige a referência do backup Neon:

    uv run python -m scripts.migrar_eventos_inauguracao_prevista \
      --apply --backup-reference '<referência>'

O histórico de EventoMarco é append-only: para cada correção é criado um
novo evento com ``data_prevista`` e o evento original é marcado como
substituído. Nenhuma data de ocorrência é sobrescrita.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.audit import log_action
from app.db.base import SessionLocal
from app.db.models import EventoMarco, MarcoCatalogo

CODIGO_MARCO_INAUGURACAO = "cronograma_previsao_inauguracao"


def executar(*, dry_run: bool = True, backup_reference: str | None = None) -> dict[str, int]:
    """Migra somente previsões inequivocamente cadastradas como ocorrência."""
    if not dry_run and not (backup_reference and backup_reference.strip()):
        raise ValueError("--apply exige --backup-reference com o backup confirmado.")

    resultado: Counter[str] = Counter()
    with SessionLocal() as db:
        candidatos = db.execute(
            select(EventoMarco)
            .join(MarcoCatalogo, MarcoCatalogo.id == EventoMarco.marco_id)
            .where(
                MarcoCatalogo.codigo == CODIGO_MARCO_INAUGURACAO,
                EventoMarco.data_ocorrencia > date.today(),
                EventoMarco.data_prevista.is_(None),
                EventoMarco.substituido_por_id.is_(None),
                EventoMarco.deletado_em.is_(None),
            )
            .order_by(EventoMarco.id)
        ).scalars()

        for anterior in candidatos:
            nova = EventoMarco(
                instrumento_id=anterior.instrumento_id,
                marco_id=anterior.marco_id,
                fase_geral_id=anterior.fase_geral_id,
                data_prevista=anterior.data_ocorrencia,
                status_regulatorio=anterior.status_regulatorio,
                numero_documento=anterior.numero_documento,
                data_validade=anterior.data_validade,
                observacao=anterior.observacao,
                autor_id=anterior.autor_id,
            )
            db.add(nova)
            db.flush()
            anterior.substituido_por_id = nova.id
            anterior.atualizado_em = datetime.now(timezone.utc)
            log_action(
                db,
                user_id=None,
                entity_name="evento_marco",
                entity_id=anterior.id,
                action="migracao_inauguracao_para_previsao",
                details={
                    "evento_substituto_id": nova.id,
                    "motivo": "data_futura_nao_pode_ser_ocorrencia",
                    "backup_reference": backup_reference if not dry_run else None,
                },
            )
            resultado["eventos_migrados"] += 1

        if dry_run:
            db.rollback()
        else:
            db.commit()
    resultado["modo_dry_run"] = int(dry_run)
    return dict(resultado)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modo = parser.add_mutually_exclusive_group()
    modo.add_argument("--dry-run", action="store_true", help="simula e faz rollback (padrão)")
    modo.add_argument("--apply", action="store_true", help="aplica após backup confirmado")
    parser.add_argument("--backup-reference", help="referência do backup anterior à aplicação")
    args = parser.parse_args()
    print(executar(dry_run=not args.apply, backup_reference=args.backup_reference))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
