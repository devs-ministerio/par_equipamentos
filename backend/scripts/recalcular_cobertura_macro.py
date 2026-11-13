"""Recalcula os campos derivados de `macro_coverage` a partir da população e da oferta já gravadas.

Motivo (achado D32, 29/10/2026): a execução publicada do PET-CT (id 11, de 01/09/2026) foi gravada com
arredondamento para baixo (piso) na necessidade de equipamentos; a regra atual é para cima
(`calcular_cobertura`, `math.ceil`). Em produção 87 das 121 macros divergiam e 59 sem nenhuma oferta
estavam como suficientes. O nível municipal, Tomógrafo e Ressonância estão corretos.

Não refaz a coleta: usa `population` e `available_qty` (equipamento SUS em uso) que já estão na linha,
aplica `calcular_cobertura` com a produtividade da família e corrige `required_qty`, `estimated_need`,
`balance` e `deficit_status`. Macro sem população (`not_available`) não é tocada. Idempotente: segunda
rodada não altera nada. Uma linha de auditoria por macro alterada, com o valor antigo e o novo.

Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.recalcular_cobertura_macro --familia PET_CT
    python -m scripts.recalcular_cobertura_macro --familia PET_CT --aplicar --confirmo-host HOST
    python -m scripts.recalcular_cobertura_macro --execucao 11 --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import Competency, MacroCoverage
from app.pipeline.cobertura import calcular_cobertura, produtividade_por_familia


@dataclass
class Resultado:
    execucoes: list[int] = field(default_factory=list)
    examinadas: int = 0
    alteradas: int = 0
    antes: Counter = field(default_factory=Counter)
    depois: Counter = field(default_factory=Counter)


def _execucoes_publicadas(db: Session, familia: str | None) -> list[int]:
    consulta = select(Competency.published_execution_id).where(Competency.published_execution_id.is_not(None))
    if familia:
        consulta = consulta.where(Competency.equipment_family == familia)
    return sorted({i for i in db.execute(consulta).scalars() if i is not None})


def recalcular(db: Session, *, aplicar: bool, familia: str | None = None, execucao_id: int | None = None) -> Resultado:
    resultado = Resultado(execucoes=[execucao_id] if execucao_id else _execucoes_publicadas(db, familia))
    if not resultado.execucoes:
        return resultado
    linhas = db.execute(
        select(MacroCoverage).where(MacroCoverage.execution_id.in_(resultado.execucoes)).order_by(MacroCoverage.id)
    ).scalars()
    for macro in linhas:
        if familia and macro.equipment_family != familia:
            continue
        resultado.examinadas += 1
        if not macro.population:
            continue
        correto = calcular_cobertura(
            population=macro.population,
            in_use_sus=macro.available_qty or 0,
            produtividade=produtividade_por_familia(macro.equipment_family),
        )
        resultado.antes[macro.deficit_status.value] += 1
        resultado.depois[correto.deficit_status.value] += 1
        igual = (
            macro.required_qty == correto.required_qty
            and macro.balance == correto.balance
            and macro.deficit_status == correto.deficit_status
            and abs(float(macro.estimated_need or 0) - correto.estimated_need) < 1e-6
        )
        if igual:
            continue
        resultado.alteradas += 1
        if aplicar:
            antigo = {
                "required_qty": macro.required_qty,
                "balance": macro.balance,
                "deficit_status": macro.deficit_status.value,
                "estimated_need": float(macro.estimated_need or 0),
            }
            macro.required_qty = correto.required_qty
            macro.estimated_need = correto.estimated_need
            macro.balance = correto.balance
            macro.deficit_status = correto.deficit_status
            log_action(
                db,
                user_id=None,
                entity_name="macro_coverage",
                entity_id=macro.id,
                action="recalculated",
                details={
                    "motivo": "necessidade gravada com regra de arredondamento anterior (D32)",
                    "execucao": macro.execution_id,
                    "macro": macro.macro_code,
                    "old": antigo,
                    "new": {
                        "required_qty": correto.required_qty,
                        "balance": correto.balance,
                        "deficit_status": correto.deficit_status.value,
                        "estimated_need": correto.estimated_need,
                    },
                },
            )
    if aplicar:
        db.flush()
    return resultado


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--familia", help="família (por exemplo PET_CT); sem isso, todas as publicadas")
    analisador.add_argument("--execucao", type=int, help="id de uma execução específica")
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)

    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    with SessionLocal() as db:
        r = recalcular(db, aplicar=args.aplicar, familia=args.familia, execucao_id=args.execucao)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    print(("Gravado" if args.aplicar else "Simulação (nada foi alterado)"))
    print(f"  execuções: {r.execucoes}; macros examinadas: {r.examinadas}; a corrigir: {r.alteradas}")
    print(f"  classificação gravada: {dict(r.antes)}")
    print(f"  classificação correta: {dict(r.depois)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
