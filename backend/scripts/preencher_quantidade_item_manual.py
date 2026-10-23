"""Grava QTD_ITEM = 1 no item de equipamento das cargas manuais que ainda não têm quantidade.

Regra da equipe: cada instrumento PERSUS I, PERSUS II, FAF e TED tem um único
equipamento. Os itens de carga manual (`ORIGEM_ITEM = carga_manual_inicial`) vieram sem
`QTD_ITEM`, porque não passaram pelo plano de aplicação do SICONV.

- Só PERSUS I, PERSUS II, FAF e TED. Itens manuais de "Convênio" e PRONON ficam de fora
  e são apenas contados no relatório da execução.
- Um item por convênio: o da descrição do marcador visível, senão o primeiro item
  manual. Quando existem dois itens que diferem só na caixa, o segundo não recebe.
- Nunca sobrescreve quantidade existente; idempotente.
- Sem ``--aplicar`` apenas informa o que mudaria. Uma linha de ``AuditLog`` por convênio.

Uso:
    python -m scripts.preencher_quantidade_item_manual
    python -m scripts.preencher_quantidade_item_manual --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import Convenio
from app.repositories import equipamento_marcadores as marcadores_repo
from scripts.lib_monitoramento_convenio import ORIGEM_ITEM_MANUAL_INICIAL, QUANTIDADE_ITEM_MANUAL

TIPOS = ("PERSUS I", "PERSUS II", "FAF", "TED")
ACAO = "preencher_quantidade_item_manual"


@dataclass(frozen=True)
class Resultado:
    alterados: int = 0
    ja_com_quantidade: int = 0
    sem_item_manual: int = 0
    fora_da_regra: int = 0


def _indice_alvo(itens: list, descricao_marcador: str | None) -> int | None:
    manuais = [
        i
        for i, item in enumerate(itens)
        if isinstance(item, dict)
        and item.get("ORIGEM_ITEM") == ORIGEM_ITEM_MANUAL_INICIAL
        and item.get("DESCRICAO_ITEM")
    ]
    if not manuais:
        return None
    for i in manuais:
        if itens[i]["DESCRICAO_ITEM"] == descricao_marcador:
            return i
    return manuais[0]


def preencher(db, *, aplicar: bool) -> Resultado:
    alterados = ja = sem_item = 0
    convenios = db.execute(select(Convenio).where(Convenio.tipo_contratacao.in_(TIPOS)).order_by(Convenio.id)).scalars()
    for convenio in list(convenios):
        itens = [
            dict(i) if isinstance(i, dict) else i
            for i in ((convenio.siconv_raw or {}).get("itens_plano_aplicacao") or [])
        ]
        marcadores = marcadores_repo.listar_por_origens(db, convenio_ids={convenio.id}).get(
            ("convenio", convenio.id), []
        )
        indice = _indice_alvo(itens, marcadores[0].descricao_original if marcadores else None)
        if indice is None:
            sem_item += 1
            continue
        if itens[indice].get("QTD_ITEM"):
            ja += 1
            continue
        itens[indice]["QTD_ITEM"] = QUANTIDADE_ITEM_MANUAL
        if aplicar:
            bruto = dict(convenio.siconv_raw or {})
            bruto["itens_plano_aplicacao"] = itens
            convenio.siconv_raw = bruto
            log_action(
                db,
                user_id=None,
                entity_name="convenio",
                entity_id=convenio.id,
                action=ACAO,
                details={"item": itens[indice]["DESCRICAO_ITEM"], "quantidade": QUANTIDADE_ITEM_MANUAL},
            )
        alterados += 1
    brutos = db.execute(select(Convenio.siconv_raw).where(Convenio.tipo_contratacao.not_in(TIPOS))).scalars()
    fora_da_regra = sum(
        1
        for bruto in brutos
        for item in ((bruto or {}).get("itens_plano_aplicacao") or [])
        if isinstance(item, dict) and item.get("ORIGEM_ITEM") == ORIGEM_ITEM_MANUAL_INICIAL and not item.get("QTD_ITEM")
    )
    return Resultado(alterados, ja, sem_item, fora_da_regra)


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
        resultado = preencher(db, aplicar=args.aplicar)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    modo = "gravados" if args.aplicar else "a gravar (simulação, nada foi alterado)"
    print(f"Quantidade 1 {modo}: {resultado.alterados}")
    print(f"  já tinham quantidade: {resultado.ja_com_quantidade}")
    print(f"  sem item manual (ignorados): {resultado.sem_item_manual}")
    print(f"  itens manuais fora da regra (Convênio, PRONON), sem quantidade: {resultado.fora_da_regra}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
