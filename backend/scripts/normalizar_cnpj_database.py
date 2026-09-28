"""Normaliza CNPJ de forma idempotente e auditável.

Uso seguro (simulação padrão):

    uv run python -m scripts.normalizar_cnpj_database --dry-run

Aplicação exige snapshot/PITR confirmado e registra a referência no AuditLog:

    uv run python -m scripts.normalizar_cnpj_database \\
      --apply --backup-reference '<referência do snapshot>'

Não use para preencher CNPJ ausente: só remove pontuação de valores que passam
a ter exatamente 14 dígitos, ou converte string vazia em NULL.
"""

from __future__ import annotations

import argparse
import hashlib
import re
from collections import Counter
from collections.abc import Mapping, Set
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select

from app.audit import log_action
from app.db.base import SessionLocal
from app.db.models import CnesEstabelecimento, Convenio, InstrumentoEquipamento, PagamentoObraPersus, PropostaCandidata

_DIGITOS = re.compile(r"[^0-9]")


@dataclass(frozen=True)
class CampoCnpj:
    entidade: str
    model: type[Any]
    atributo: str


CAMPOS_CNPJ: tuple[CampoCnpj, ...] = (
    CampoCnpj("convenio", Convenio, "convenente_cnpj"),
    CampoCnpj("instrumento_equipamento", InstrumentoEquipamento, "cnpj_convenente"),
    CampoCnpj("pagamento_obra_persus", PagamentoObraPersus, "fornecedor_cnpj"),
    CampoCnpj("proposta_candidata", PropostaCandidata, "cnpj_ente_recebedor"),
    CampoCnpj("cnes_estabelecimento", CnesEstabelecimento, "cnpj"),
)


def cnpj_canonico(valor: str) -> tuple[str | None, str | None]:
    """Retorna novo valor e motivo; ambiguidade retorna ``(None, None)``."""
    if not valor.strip():
        return None, "vazio_para_null"
    somente_digitos = _DIGITOS.sub("", valor)
    if len(somente_digitos) == 14:
        return somente_digitos, "remove_pontuacao"
    return None, None


def _candidatos(campo: CampoCnpj, ids: Set[int] | None = None):
    coluna = getattr(campo.model, campo.atributo)
    consulta = select(campo.model).where(coluna.is_not(None), coluna.op("!~")("^[0-9]{14}$"))
    if ids is not None:
        consulta = consulta.where(campo.model.id.in_(ids))
    return consulta


def executar(
    *,
    dry_run: bool = True,
    backup_reference: str | None = None,
    ids_por_entidade: Mapping[str, Set[int]] | None = None,
) -> dict[str, int]:
    """Executa em uma transação; em dry-run sempre faz rollback.

    ``ids_por_entidade`` é um recorte interno para testes. A CLI nunca o
    fornece e, portanto, sempre percorre todo o conjunto de campos definido.
    """
    if not dry_run and not (backup_reference and backup_reference.strip()):
        raise ValueError("--apply exige --backup-reference com o snapshot/PITR confirmado.")

    resultado: Counter[str] = Counter()
    with SessionLocal() as db:
        for campo in CAMPOS_CNPJ:
            ids = ids_por_entidade.get(campo.entidade) if ids_por_entidade else None
            for registro in db.execute(_candidatos(campo, ids)).scalars():
                valor_atual = getattr(registro, campo.atributo)
                assert isinstance(valor_atual, str)
                novo_valor, motivo = cnpj_canonico(valor_atual)
                if motivo is None:
                    resultado["ambiguos_ignorados"] += 1
                    continue

                setattr(registro, campo.atributo, novo_valor)
                log_action(
                    db,
                    user_id=None,
                    entity_name=campo.entidade,
                    entity_id=registro.id,
                    action="normalizacao_cnpj",
                    details={
                        "campo": campo.atributo,
                        "motivo": motivo,
                        "hash_anterior": hashlib.sha256(valor_atual.encode("utf-8")).hexdigest(),
                        "backup_reference": backup_reference if not dry_run else None,
                    },
                )
                resultado[f"{campo.entidade}.{motivo}"] += 1
                resultado["alteracoes"] += 1

        if dry_run:
            db.rollback()
        else:
            db.commit()
    resultado["modo_dry_run"] = int(dry_run)
    return dict(sorted(resultado.items()))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modo = parser.add_mutually_exclusive_group()
    modo.add_argument("--dry-run", action="store_true", help="simula e faz rollback (padrão)")
    modo.add_argument("--apply", action="store_true", help="aplica mudanças após snapshot confirmado")
    parser.add_argument("--backup-reference", help="referência do snapshot/PITR confirmada antes de --apply")
    args = parser.parse_args()
    resultado = executar(dry_run=not args.apply, backup_reference=args.backup_reference)
    print(", ".join(f"{chave}={valor}" for chave, valor in resultado.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
