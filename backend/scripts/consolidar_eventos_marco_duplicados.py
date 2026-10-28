"""Consolida EventoMarco com mais de 1 evento ativo pro mesmo (instrumento, marco).

Achado na auditoria de banco (2026-10-28): a regra "ativo = substituido_por_id IS NULL AND
deletado_em IS NULL, só 1 por marco" (ver docstring de EventoMarco) nunca foi garantida por
constraint no banco — só o índice `idx_evento_marco_ativo`, que é comum, não `UNIQUE`. 158 pares
(instrumento, marco) em produção tinham mais de 1 evento ativo simultâneo, herdados de imports que
nunca marcaram o evento antigo como substituído pelo mais novo/completo (mesma classe de bug já
corrigida uma vez em 2026-09-19 pra 33 grupos, que reapareceu em imports posteriores).

Este script precisa rodar e zerar os duplicados ANTES de a migração poder criar o índice único
(Postgres rejeita `CREATE UNIQUE INDEX` com violação existente).

Critério de sobrevivente — mesma prioridade que o app já usa implicitamente pra "evento vigente"
(regra confirmada com o usuário em 2026-09-27: ocorrência real sempre vence sobre previsão):
    1. tem `data_ocorrencia` preenchida (vence sobre só `data_prevista` ou nenhuma das duas)
    2. `created_at` mais recente
    3. `id` maior (desempate final)
Os demais do grupo apontam `substituido_por_id` pro sobrevivente — nunca apagados, nunca editados
("editar" nesta tabela é sempre lançar/apontar, nunca UPDATE do conteúdo histórico).

Sem ``--aplicar`` apenas simula. Idempotente. Uma linha de auditoria por instrumento alterado.

Uso:
    python -m scripts.consolidar_eventos_marco_duplicados
    python -m scripts.consolidar_eventos_marco_duplicados --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import EventoMarco


@dataclass
class Resultado:
    grupos_resolvidos: int = 0
    eventos_substituidos: int = 0
    por_instrumento: dict[int, list[tuple[int, int]]] = field(default_factory=lambda: defaultdict(list))


def _chave_prioridade(evento: EventoMarco) -> tuple[bool, datetime, int]:
    return (evento.data_ocorrencia is not None, evento.created_at, evento.id)


def executar(db: Session, *, aplicar: bool) -> Resultado:
    resultado = Resultado()
    ativos = db.execute(
        select(EventoMarco).where(EventoMarco.substituido_por_id.is_(None), EventoMarco.deletado_em.is_(None))
    ).scalars().all()

    grupos: dict[tuple[int, int], list[EventoMarco]] = defaultdict(list)
    for evento in ativos:
        grupos[(evento.instrumento_id, evento.marco_id)].append(evento)

    for (instrumento_id, _marco_id), eventos in grupos.items():
        if len(eventos) < 2:
            continue
        sobrevivente = max(eventos, key=_chave_prioridade)
        resultado.grupos_resolvidos += 1
        for evento in eventos:
            if evento.id == sobrevivente.id:
                continue
            resultado.eventos_substituidos += 1
            resultado.por_instrumento[instrumento_id].append((evento.id, sobrevivente.id))
            if aplicar:
                evento.substituido_por_id = sobrevivente.id
                evento.atualizado_em = datetime.now(UTC)

    if aplicar:
        for instrumento_id, pares in resultado.por_instrumento.items():
            log_action(
                db,
                user_id=None,
                entity_name="instrumento_equipamento",
                entity_id=instrumento_id,
                action="consolidacao_evento_duplicado",
                details={"substituidos": [{"evento_id": e, "sobrevivente_id": s} for e, s in pares]},
            )
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
    print(f"  grupos (instrumento, marco) com duplicidade resolvidos: {resultado.grupos_resolvidos}")
    print(f"  eventos marcados como substituídos: {resultado.eventos_substituidos}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
