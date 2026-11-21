"""Migra os instrumentos concluídos pelo evento antigo `fase_concluido` para a conclusão confirmada.

Para cada instrumento com evento `fase_concluido` ativo e sem `conclusao_instrumento` ativa, aplica as mesmas
regras da tela de conclusão:

- **sem impedimento e resultado integral**: grava a conclusão (`integral`, data do evento, inauguração realizada
  quando houver);
- **só ação aberta como impedimento** (e resultado integral): a ação é concluída (única alteração que uma ação
  aceita) e a conclusão é gravada. Instrumento com pendência real, informado em ``--pendencia-real``, não entra aqui;
- **qualquer outro caso** (sem entrega, parcial, item na fila de revisão, sem data, pendência real): o evento antigo
  é excluído (soft delete com motivo) e o instrumento sai de "Concluído" até a equipe revisar. A lista sai no fim.

Rodar depois de `corrigir_entregas_persus_i`. Idempotente. Sem ``--aplicar`` apenas
simula; avisos de prazo das ações concluídas são arquivados na próxima rodada de `job_prazos_monitoramento`.

Uso:
    python -m scripts.migrar_concluidos_para_conclusao
    python -m scripts.migrar_concluidos_para_conclusao --pendencia-real 311 --pendencia-real 948684 \
        --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter
from collections.abc import Collection
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import ConclusaoInstrumento, EventoMarco, InstrumentoEquipamento, MarcoCatalogo
from app.repositories import conclusoes as conclusoes_repo
from app.repositories import monitoramento as monitoramento_repo
from app.services.conclusao_acompanhamento import _impedimentos, _itens_controlados, calcular_resultado

MARCO_CONCLUIDO = "fase_concluido"
MARCO_INAUGURACAO = "cronograma_previsao_inauguracao"
MOTIVO_REVISAO = (
    "Conclusão antiga sem entrega conferida: o instrumento aguarda revisão da equipe (fluxo de 19/11/2026)."
)


def _eventos_concluidos(db: Session) -> list[EventoMarco]:
    return list(
        db.scalars(
            select(EventoMarco)
            .join(MarcoCatalogo, MarcoCatalogo.id == EventoMarco.marco_id)
            .where(
                MarcoCatalogo.codigo == MARCO_CONCLUIDO,
                EventoMarco.substituido_por_id.is_(None),
                EventoMarco.deletado_em.is_(None),
            )
            .order_by(EventoMarco.instrumento_id, EventoMarco.id)
        )
    )


def _decidir(db: Session, instrumento: InstrumentoEquipamento, evento: EventoMarco, reais: Collection[str]):
    """("migrar" | "migrar_fechando_acoes" | "revisao", motivo, resultado)."""
    if evento.data_ocorrencia is None:
        return "revisao", "sem data de conclusão", None
    itens = _itens_controlados(db, instrumento.id)
    impedimentos = _impedimentos(db, instrumento.id, itens)
    resultado = calcular_resultado(itens)
    if resultado != "integral":
        return "revisao", f"resultado {resultado}", resultado
    tipos = {i.tipo for i in impedimentos}
    if not tipos:
        return "migrar", "", resultado
    if tipos == {"acao_aberta"} and instrumento.nr_convenio not in reais:
        return "migrar_fechando_acoes", "", resultado
    return "revisao", "impedimentos: " + ", ".join(sorted(tipos)), resultado


def _migrar(db: Session, instrumento: InstrumentoEquipamento, evento: EventoMarco, *, fechar_acoes: bool) -> None:
    if fechar_acoes:
        for acao in conclusoes_repo.listar_acoes_abertas(db, instrumento.id):
            acao.data_conclusao = date.today()
            log_action(
                db,
                user_id=None,
                entity_name="acao_monitoramento",
                entity_id=acao.id,
                action="completed",
                details={"old": None, "new": acao.data_conclusao.isoformat(), "origem": "migracao_concluidos"},
            )
    marco_inauguracao = monitoramento_repo.obter_marco_por_codigo(db, MARCO_INAUGURACAO)
    inauguracao = (
        monitoramento_repo.obter_evento_mais_recente_do_marco(
            db, instrumento_id=instrumento.id, marco_id=marco_inauguracao.id
        )
        if marco_inauguracao
        else None
    )
    conclusao = ConclusaoInstrumento(
        instrumento_id=instrumento.id,
        resultado="integral",
        data_conclusao=evento.data_ocorrencia,
        data_inauguracao=inauguracao.data_ocorrencia if inauguracao else None,
        autor_id=None,
    )
    conclusoes_repo.adicionar(db, conclusao)
    log_action(
        db,
        user_id=None,
        entity_name="conclusao_instrumento",
        entity_id=conclusao.id,
        action="created",
        details={"nr_convenio": instrumento.nr_convenio, "resultado": "integral", "origem": "migracao_concluidos"},
    )


def _enviar_para_revisao(db: Session, instrumento: InstrumentoEquipamento, evento: EventoMarco, motivo: str) -> None:
    evento.deletado_em = datetime.now(timezone.utc)
    evento.motivo_exclusao = MOTIVO_REVISAO
    log_action(
        db,
        user_id=None,
        entity_name="evento_marco",
        entity_id=evento.id,
        action="deleted",
        details={"nr_convenio": instrumento.nr_convenio, "motivo": MOTIVO_REVISAO, "detalhe": motivo},
    )


def executar(
    db: Session, *, aplicar: bool, pendencias_reais: Collection[str] = ()
) -> tuple[Counter[str], list[tuple[str, str]]]:
    contagem: Counter[str] = Counter()
    revisao: list[tuple[str, str]] = []
    for evento in _eventos_concluidos(db):
        instrumento = db.get(InstrumentoEquipamento, evento.instrumento_id)
        if instrumento is None or conclusoes_repo.existe_ativa(db, instrumento.id):
            contagem["já migrado"] += 1
            continue
        decisao, motivo, _ = _decidir(db, instrumento, evento, pendencias_reais)
        if decisao == "revisao":
            contagem["vai à revisão"] += 1
            revisao.append((instrumento.nr_convenio, motivo))
            if aplicar:
                _enviar_para_revisao(db, instrumento, evento, motivo)
            continue
        contagem["conclusão com ações fechadas" if decisao == "migrar_fechando_acoes" else "conclusão"] += 1
        if aplicar:
            _migrar(db, instrumento, evento, fechar_acoes=decisao == "migrar_fechando_acoes")
    return contagem, revisao


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    analisador.add_argument(
        "--pendencia-real", action="append", default=[], help="nr_convenio cuja ação aberta é pendência real"
    )
    args = analisador.parse_args(argv)
    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    with SessionLocal() as db:
        contagem, revisao = executar(db, aplicar=args.aplicar, pendencias_reais=set(args.pendencia_real))
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    print("Conclusões migradas." if args.aplicar else "Simulação: nada foi alterado.")
    for rotulo, n in contagem.most_common():
        print(f"  {rotulo}: {n}")
    for numero, motivo in revisao:
        print(f"  revisão {numero}: {motivo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
