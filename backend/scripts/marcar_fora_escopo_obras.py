"""Marca como fora de escopo os convênios cujos itens de equipamento não existem: só obra ou serviço.

Obra não faz parte do SISGEO. A marca (`convenio.fora_escopo_equipamentos`) preserva o registro no banco e
o tira de todas as telas, relatórios, avisos e do monitoramento. Critério: o convênio tem itens na fonte oficial
e todos são `OBRA` ou `SERVICO`. Carga manual (PERSUS, FAF, TED) e convênio sem item algum nunca entram.

Sem ``--aplicar`` apenas simula. Idempotente. Uma linha de auditoria por convênio. ``--desfazer`` tira a marca
dos mesmos convênios.

Uso:
    python -m scripts.marcar_fora_escopo_obras
    python -m scripts.marcar_fora_escopo_obras --aplicar --confirmo-host HOST
    python -m scripts.marcar_fora_escopo_obras --aplicar --desfazer --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import Convenio, InstrumentoEquipamento
from app.pipeline.itens_plano import item_conta_como_equipamento


@dataclass
class Resultado:
    candidatos: list[tuple[str, bool]] = field(default_factory=list)  # (número, monitorado)
    alterados: int = 0
    ja_no_estado: int = 0


def so_obra_ou_servico(convenio: Convenio) -> bool:
    itens = [i for i in ((convenio.siconv_raw or {}).get("itens_plano_aplicacao") or []) if isinstance(i, dict)]
    return bool(itens) and not any(item_conta_como_equipamento(i) for i in itens)


def marcar(db: Session, *, aplicar: bool, desfazer: bool) -> Resultado:
    resultado = Resultado()
    monitorados = {
        (i.nr_convenio, i.tipo_contratacao or "Convênio") for i in db.execute(select(InstrumentoEquipamento)).scalars()
    }
    alvo = not desfazer
    for convenio in db.execute(select(Convenio).order_by(Convenio.numero)).scalars():
        if not so_obra_ou_servico(convenio):
            continue
        monitorado = (convenio.numero, convenio.tipo_contratacao or "Convênio") in monitorados
        resultado.candidatos.append((convenio.numero, monitorado))
        if convenio.fora_escopo_equipamentos == alvo:
            resultado.ja_no_estado += 1
            continue
        resultado.alterados += 1
        if aplicar:
            convenio.fora_escopo_equipamentos = alvo
            log_action(
                db,
                user_id=None,
                entity_name="convenio",
                entity_id=convenio.id,
                action="fora_de_escopo_obra" if alvo else "volta_ao_escopo_obra",
                details={"numero": convenio.numero, "monitorado": monitorado, "motivo": "itens só de obra ou serviço"},
            )
    return resultado


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--desfazer", action="store_true", help="tira a marca dos mesmos convênios")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)

    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    with SessionLocal() as db:
        r = marcar(db, aplicar=args.aplicar, desfazer=args.desfazer)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    verbo = "volta ao escopo" if args.desfazer else "fora de escopo"
    print(("Gravado" if args.aplicar else "Simulação (nada foi alterado)") + f" — {verbo}")
    print(
        f"  convênios só de obra/serviço: {len(r.candidatos)}; alterados: {r.alterados}; já no estado: {r.ja_no_estado}"
    )
    print(f"  monitorados entre eles: {sum(1 for _, m in r.candidatos if m)}")
    for numero, monitorado in r.candidatos:
        print(f"    {numero}{' (monitorado)' if monitorado else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
