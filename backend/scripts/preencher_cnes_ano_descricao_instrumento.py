"""Preenche cnes/ano_instrumento/equipamento_descricao de InstrumentoEquipamento tipo "Convênio".

Achado na investigação do Painel de Gestão (2026-10-28): 182 instrumentos tipo "Convênio"
(no escopo de equipamentos) estão sem `cnes`/`ano_instrumento`, e 187 sem
`equipamento_descricao` — não por falta real de dado, mas porque o enriquecimento normal
nunca rodou para esses registros:

- `cnes`/`ano_instrumento` já existem em `Convenio` (import SICONV, ver
  `scripts/importar_convenios_banco.py`) e só não foram copiados para o instrumento
  monitorado correspondente.
- `equipamento_descricao` não existe em `Convenio` (é campo próprio do monitoramento,
  historicamente preenchido só pela planilha manual da equipe), mas pode ser derivado dos
  itens de aquisição em `ItemPlano` (mesma convenção de concatenar com " + " quando há mais
  de um equipamento, já documentada para convênio com múltiplos itens).

Nunca sobrescreve valor já preenchido. Sem fonte disponível (nem em Convenio, nem em
ItemPlano), o campo fica nulo — não inventa dado. Idempotente: rodar de novo depois de
aplicado não altera nada.

Sem ``--aplicar`` apenas simula. Uma linha de auditoria por instrumento alterado.

Uso:
    python -m scripts.preencher_cnes_ano_descricao_instrumento
    python -m scripts.preencher_cnes_ano_descricao_instrumento --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import Convenio, InstrumentoEquipamento, ItemPlano


@dataclass
class Resultado:
    total_candidatos: int = 0
    cnes_preenchidos: int = 0
    ano_preenchidos: int = 0
    descricao_preenchidos: int = 0
    descricao_sem_fonte: int = 0


def _equipamento_descricao_derivada(db: Session, instrumento_id: int) -> str | None:
    descricoes = (
        db.execute(
            select(ItemPlano.descricao)
            .where(
                ItemPlano.instrumento_id == instrumento_id,
                ItemPlano.tipo_lancamento == "aquisicao",
                ItemPlano.ativo.is_(True),
            )
            .order_by(ItemPlano.id)
        )
        .scalars()
        .all()
    )
    return " + ".join(descricoes) if descricoes else None


def executar(db: Session, *, aplicar: bool) -> Resultado:
    resultado = Resultado()
    pares = db.execute(
        select(InstrumentoEquipamento, Convenio)
        .join(Convenio, Convenio.numero == InstrumentoEquipamento.nr_convenio)
        .where(
            InstrumentoEquipamento.tipo_contratacao == "Convênio",
            Convenio.fora_escopo_equipamentos.is_(False),
        )
    ).all()
    for instrumento, convenio in pares:
        resultado.total_candidatos += 1
        alterado: dict[str, object] = {}

        if instrumento.cnes is None and convenio.cnes is not None:
            if aplicar:
                instrumento.cnes = convenio.cnes
            alterado["cnes"] = convenio.cnes
            resultado.cnes_preenchidos += 1

        if instrumento.ano_instrumento is None and convenio.ano_instrumento is not None:
            if aplicar:
                instrumento.ano_instrumento = convenio.ano_instrumento
            alterado["ano_instrumento"] = convenio.ano_instrumento
            resultado.ano_preenchidos += 1

        if not instrumento.equipamento_descricao:
            descricao = _equipamento_descricao_derivada(db, instrumento.id)
            if descricao:
                if aplicar:
                    instrumento.equipamento_descricao = descricao
                alterado["equipamento_descricao"] = descricao
                resultado.descricao_preenchidos += 1
            else:
                resultado.descricao_sem_fonte += 1

        if alterado and aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="instrumento_equipamento",
                entity_id=instrumento.id,
                action="backfill_cnes_ano_descricao",
                details={"nr_convenio": instrumento.nr_convenio, **alterado},
            )

    if aplicar:
        db.flush()
    return resultado


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
        resultado = executar(db, aplicar=args.aplicar)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()

    print("Gravado" if args.aplicar else "Simulação (nada foi alterado)")
    print(f"  instrumentos Convênio no escopo: {resultado.total_candidatos}")
    print(f"  cnes preenchidos: {resultado.cnes_preenchidos}")
    print(f"  ano_instrumento preenchidos: {resultado.ano_preenchidos}")
    print(f"  equipamento_descricao preenchidos: {resultado.descricao_preenchidos}")
    print(f"  equipamento_descricao sem fonte (nenhum item_plano de aquisição): {resultado.descricao_sem_fonte}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
