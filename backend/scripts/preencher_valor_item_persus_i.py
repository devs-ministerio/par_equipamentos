"""Grava o valor do equipamento no item dos PERSUS I que ainda não têm valor.

Os 92 convênios PERSUS I têm o item do equipamento (``siconv_raw.itens_plano_aplicacao``,
descrição "Acelerador Linear") mas nenhum ``VALOR_TOTAL_ITEM``, então o relatório
mostra o acelerador sem valor. Regra da equipe: cada PERSUS I é um único acelerador,
logo o valor global do instrumento é o valor do equipamento.

- Só escreve o valor no item que o relatório usa (o da descrição do marcador
  visível). Quando há dois itens que diferem só na caixa ("Acelerador Linear" e
  "Acelerador linear"), o valor vai em UM, para não contar em dobro.
- Nunca sobrescreve valor existente; idempotente (segunda execução não muda nada).
- Grava ``VALOR_ITEM_ORIGEM`` no item e uma linha em ``AuditLog`` por convênio.
- Sem ``--aplicar`` apenas informa o que mudaria (nada é gravado).

Uso:
    python -m scripts.preencher_valor_item_persus_i                          # simulação
    python -m scripts.preencher_valor_item_persus_i --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import Convenio
from app.repositories import equipamento_marcadores as marcadores_repo
from scripts.lib_monitoramento_convenio import ORIGEM_VALOR_ITEM_GLOBAL, valor_item_em_texto

TIPO = "PERSUS I"
ACAO = "preencher_valor_item_persus_i"


@dataclass(frozen=True)
class Resultado:
    alterados: int = 0
    ja_com_valor: int = 0
    sem_valor_global: int = 0
    sem_item: int = 0


def _item_alvo(itens: list, descricao_marcador: str | None) -> int | None:
    """Índice do item a receber o valor: o da descrição do marcador, senão o primeiro."""
    indices = [i for i, item in enumerate(itens) if isinstance(item, dict) and item.get("DESCRICAO_ITEM")]
    if not indices:
        return None
    for i in indices:
        if itens[i]["DESCRICAO_ITEM"] == descricao_marcador:
            return i
    return indices[0]


def preencher(db, *, aplicar: bool) -> Resultado:
    alterados = ja_com_valor = sem_valor_global = sem_item = 0
    convenios = db.execute(select(Convenio).where(Convenio.tipo_contratacao == TIPO).order_by(Convenio.id)).scalars()
    for convenio in list(convenios):
        itens = [
            dict(i) if isinstance(i, dict) else i
            for i in ((convenio.siconv_raw or {}).get("itens_plano_aplicacao") or [])
        ]
        if any(isinstance(i, dict) and i.get("VALOR_TOTAL_ITEM") for i in itens):
            ja_com_valor += 1
            continue
        if convenio.valor_global is None or Decimal(convenio.valor_global) <= 0:
            sem_valor_global += 1
            continue
        marcadores = marcadores_repo.listar_por_origens(db, convenio_ids={convenio.id}).get(
            ("convenio", convenio.id), []
        )
        indice = _item_alvo(itens, marcadores[0].descricao_original if marcadores else None)
        if indice is None:
            sem_item += 1
            continue
        valor = valor_item_em_texto(convenio.valor_global)
        itens[indice]["VALOR_TOTAL_ITEM"] = valor
        itens[indice]["VALOR_ITEM_ORIGEM"] = ORIGEM_VALOR_ITEM_GLOBAL
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
                details={"item": itens[indice]["DESCRICAO_ITEM"], "valor": valor},
            )
        alterados += 1
    return Resultado(alterados, ja_com_valor, sem_valor_global, sem_item)


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
    print(f"PERSUS I {modo}: {resultado.alterados}")
    print(f"  já tinham valor no item: {resultado.ja_com_valor}")
    print(f"  sem valor global (ignorados): {resultado.sem_valor_global}")
    print(f"  sem item de equipamento (ignorados): {resultado.sem_item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
