"""Reabre eventos de cronograma físico e regulatório que a consolidação de 28/10/2026 escondeu.

`consolidar_eventos_marco_duplicados.py` tratou, na primeira rodada, todos os grupos (instrumento,
marco) com mais de um evento ativo. Em cronograma físico e regulatório o mesmo marco repete de
verdade: convênio com mais de um equipamento (um evento por equipamento), entrega por item e unidade
(cada entrega tem registro e data próprios) e licença por equipamento. Este script desfaz a
substituição nesses casos, sem apagar nada: zera `substituido_por_id` do evento escondido.

Reabre, entre os eventos que a consolidação substituiu (lidos do registro de auditoria
`consolidacao_evento_duplicado`):
  1. os de cronograma físico e regulatório dos instrumentos indicados em `--instrumentos`;
  2. todo evento ligado a uma entrega (`entrega_equipamento.evento_id`), de qualquer instrumento.
Fase geral nunca é reaberta: ali a linha é única por desenho.

Sem ``--aplicar`` apenas simula e lista cada evento. Idempotente. Uma linha de auditoria por
instrumento (`reabertura_evento_consolidado`).

Uso:
    python -m scripts.reabrir_eventos_consolidados --instrumentos 947527 949415
    python -m scripts.reabrir_eventos_consolidados --instrumentos 947527 --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import AuditLog, EntregaEquipamento, EventoMarco, InstrumentoEquipamento, MarcoCatalogo, MarcoGrupo

ACAO_CONSOLIDACAO = "consolidacao_evento_duplicado"
ACAO_REABERTURA = "reabertura_evento_consolidado"


@dataclass(frozen=True)
class EventoReaberto:
    evento_id: int
    instrumento_id: int
    nr_convenio: str
    marco: str
    data_ocorrencia: date | None
    data_prevista: date | None
    observacao: str | None
    motivo: str


@dataclass
class Resultado:
    reabertos: list[EventoReaberto] = field(default_factory=list)
    instrumentos_desconhecidos: list[str] = field(default_factory=list)


def _escondidos_pela_consolidacao(db: Session) -> dict[int, tuple[int, int]]:
    """evento escondido -> (instrumento, sobrevivente), conforme a auditoria da consolidação."""
    escondidos: dict[int, tuple[int, int]] = {}
    for registro in db.execute(select(AuditLog).where(AuditLog.action == ACAO_CONSOLIDACAO)).scalars():
        for par in (registro.details or {}).get("substituidos", []):
            escondidos[int(par["evento_id"])] = (int(registro.entity_id), int(par["sobrevivente_id"]))
    return escondidos


def executar(db: Session, *, aplicar: bool, instrumentos: list[str]) -> Resultado:
    resultado = Resultado()
    ids_por_numero = {
        nr: iid
        for nr, iid in db.execute(
            select(InstrumentoEquipamento.nr_convenio, InstrumentoEquipamento.id).where(
                InstrumentoEquipamento.nr_convenio.in_(instrumentos)
            )
        )
    }
    resultado.instrumentos_desconhecidos = sorted(set(instrumentos) - set(ids_por_numero))
    ids_escolhidos = set(ids_por_numero.values())
    ligados_a_entrega = set(
        db.scalars(select(EntregaEquipamento.evento_id).where(EntregaEquipamento.evento_id.is_not(None)))
    )
    escondidos = _escondidos_pela_consolidacao(db)
    if not escondidos:
        return resultado

    consulta = (
        select(EventoMarco, MarcoCatalogo.codigo, InstrumentoEquipamento.nr_convenio)
        .join(MarcoCatalogo, MarcoCatalogo.id == EventoMarco.marco_id)
        .join(InstrumentoEquipamento, InstrumentoEquipamento.id == EventoMarco.instrumento_id)
        .where(
            EventoMarco.id.in_(escondidos),
            EventoMarco.substituido_por_id.is_not(None),
            EventoMarco.deletado_em.is_(None),
            MarcoCatalogo.grupo != MarcoGrupo.fase_geral,
        )
        .order_by(InstrumentoEquipamento.nr_convenio, MarcoCatalogo.codigo, EventoMarco.id)
    )
    por_instrumento: dict[int, list[int]] = defaultdict(list)
    for evento, marco, nr_convenio in db.execute(consulta):
        _, sobrevivente = escondidos[evento.id]
        if evento.substituido_por_id != sobrevivente:
            continue  # já foi editado depois da consolidação: não mexer
        if evento.instrumento_id in ids_escolhidos:
            motivo = "instrumento indicado"
        elif evento.id in ligados_a_entrega:
            motivo = "ligado a uma entrega"
        else:
            continue
        resultado.reabertos.append(
            EventoReaberto(
                evento.id,
                evento.instrumento_id,
                nr_convenio,
                marco,
                evento.data_ocorrencia,
                evento.data_prevista,
                (evento.observacao or "")[:80] or None,
                motivo,
            )
        )
        por_instrumento[evento.instrumento_id].append(evento.id)
        if aplicar:
            evento.substituido_por_id = None
            evento.atualizado_em = datetime.now(UTC)

    if aplicar:
        for instrumento_id, evento_ids in por_instrumento.items():
            log_action(
                db,
                user_id=None,
                entity_name="instrumento_equipamento",
                entity_id=instrumento_id,
                action=ACAO_REABERTURA,
                details={"eventos": evento_ids},
            )
        db.flush()
    return resultado


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--instrumentos", nargs="*", default=[], help="números dos instrumentos (nr_convenio)")
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)

    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2

    with SessionLocal() as db:
        resultado = executar(db, aplicar=args.aplicar, instrumentos=args.instrumentos)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()

    print("Gravado" if args.aplicar else "Simulação (nada foi alterado)")
    for evento in resultado.reabertos:
        print(
            f"  {evento.nr_convenio}  {evento.marco}  evento {evento.evento_id}  "
            f"ocorrência={evento.data_ocorrencia}  prevista={evento.data_prevista}  "
            f"[{evento.motivo}]  {evento.observacao or ''}"
        )
    print(f"  eventos reabertos: {len(resultado.reabertos)}")
    if resultado.instrumentos_desconhecidos:
        print(f"  instrumentos não encontrados: {', '.join(resultado.instrumentos_desconhecidos)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
