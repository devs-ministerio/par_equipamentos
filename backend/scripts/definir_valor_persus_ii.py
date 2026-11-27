"""Grava o valor dos 50 PERSUS II: total do pregão dividido igualmente entre os aceleradores.

Decisão do usuário (24/11/2026): o valor da licitação vencida é R$ 393.250.000,00 para os 50 aceleradores
lineares do PERSUS II, ou R$ 7.865.000,00 por instrumento. Como no PERSUS I, o valor global do instrumento
é também o valor do equipamento (um acelerador por instrumento): vai para ``convenio.valor_global``, para o
item em ``siconv_raw.itens_plano_aplicacao`` e para ``item_plano.valor_total``.

- Exige exatamente 50 convênios PERSUS II com um item cada; senão aborta sem gravar.
- Nunca sobrescreve valor existente; idempotente.
- ``AuditLog`` por convênio. Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.definir_valor_persus_ii
    python -m scripts.definir_valor_persus_ii --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import Convenio, ItemPlano
from scripts.lib_monitoramento_convenio import ORIGEM_VALOR_ITEM_GLOBAL, valor_item_em_texto

TIPO = "PERSUS II"
QUANTIDADE = 50
VALOR_TOTAL = Decimal("393250000.00")
ACAO = "definir_valor_persus_ii"


def definir(db, *, aplicar: bool) -> tuple[int, int]:
    convenios = list(
        db.execute(select(Convenio).where(Convenio.tipo_contratacao == TIPO).order_by(Convenio.id)).scalars()
    )
    if len(convenios) != QUANTIDADE:
        raise RuntimeError(f"Esperados {QUANTIDADE} convênios {TIPO}, encontrados {len(convenios)}.")
    unitario = VALOR_TOTAL / QUANTIDADE
    alterados = ja_com_valor = 0
    for convenio in convenios:
        itens = [
            dict(i) if isinstance(i, dict) else i
            for i in ((convenio.siconv_raw or {}).get("itens_plano_aplicacao") or [])
        ]
        alvos = [i for i, item in enumerate(itens) if isinstance(item, dict) and item.get("DESCRICAO_ITEM")]
        if len(alvos) != 1:
            raise RuntimeError(f"Convênio {convenio.numero}: esperado 1 item, encontrado {len(alvos)}.")
        if convenio.valor_global is not None or itens[alvos[0]].get("VALOR_TOTAL_ITEM"):
            ja_com_valor += 1
            continue
        alterados += 1
        if not aplicar:
            continue
        itens[alvos[0]]["VALOR_TOTAL_ITEM"] = valor_item_em_texto(unitario)
        itens[alvos[0]]["VALOR_ITEM_ORIGEM"] = ORIGEM_VALOR_ITEM_GLOBAL
        bruto = dict(convenio.siconv_raw or {})
        bruto["itens_plano_aplicacao"] = itens
        convenio.siconv_raw = bruto
        convenio.valor_global = unitario
        for item in db.execute(select(ItemPlano).where(ItemPlano.convenio_id == convenio.id)).scalars():
            if item.valor_total is None:
                item.valor_total = unitario
        log_action(
            db,
            user_id=None,
            entity_name="convenio",
            entity_id=convenio.id,
            action=ACAO,
            details={"valor": str(unitario), "total_pregao": str(VALOR_TOTAL)},
        )
    return alterados, ja_com_valor


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)
    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    print(f"Banco: {make_url(str(engine.url)).database} em {host}")
    with SessionLocal() as db:
        alterados, ja = definir(db, aplicar=args.aplicar)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    print(("Gravados" if args.aplicar else "A gravar (simulação, nada foi alterado)") + f": {alterados}")
    print(f"  já tinham valor: {ja}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
