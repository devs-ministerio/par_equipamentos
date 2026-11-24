"""Ajusta a resposta sobre inauguração dos instrumentos (exceto os com Acelerador Linear).

Regras (decisão do usuário, 24/11/2026), por instrumento no escopo e **sem** item de aquisição de Acelerador Linear:

- conclusão ativa com resultado integral e sem nenhum registro de inauguração (nem previsão, nem realizada, nem
  dispensada): grava "Inauguração dispensada";
- sem conclusão ativa (em aberto) e com inauguração **realizada**: o lançamento da realizada é excluído com motivo
  (soft delete, nunca físico), deixando o instrumento sem registro para a equipe responder se precisa de inauguração;
- sem conclusão ativa e sem registro: nada a fazer (a equipe responde ao registrar a entrega);
- todo o resto (previsão pendente, dispensada ou realizada em concluído integral, resultado sem_entregas): fica como está.

Aceleradores nunca são alterados e saem listados no final. Idempotente. Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.ajustar_inauguracao_entregues
    python -m scripts.ajustar_inauguracao_entregues --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import ConclusaoInstrumento, EventoMarco, InstrumentoEquipamento
from app.repositories import etapas_instrumento as etapas_repo
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.convenios import instrumento_no_escopo

MARCO_PREVISAO = "cronograma_previsao_inauguracao"
MARCO_DISPENSADA = "cronograma_inauguracao_dispensada"
OBS_DISPENSADA = "Dispensada: ajuste em lote, instrumento concluído sem registro de inauguração"
MOTIVO_EXCLUSAO = "Ajuste em lote: instrumento em aberto, a equipe deve informar se precisa de inauguração"


def executar(db: Session, *, aplicar: bool) -> tuple[Counter[str], list[tuple[str, str]]]:
    contagem: Counter[str] = Counter()
    aceleradores: list[tuple[str, str]] = []
    previsao = monitoramento_repo.obter_marco_por_codigo(db, MARCO_PREVISAO)
    dispensada = monitoramento_repo.obter_marco_por_codigo(db, MARCO_DISPENSADA)
    if previsao is None or dispensada is None:
        raise RuntimeError("Marcos de inauguração não encontrados no catálogo.")
    instrumentos = db.scalars(
        select(InstrumentoEquipamento).where(instrumento_no_escopo()).order_by(InstrumentoEquipamento.id)
    ).all()
    ids = [i.id for i in instrumentos]
    com_acelerador = etapas_repo.ids_com_acelerador_linear(db, ids)
    resultado_por_id = {
        instrumento_id: resultado
        for instrumento_id, resultado in db.execute(
            select(ConclusaoInstrumento.instrumento_id, ConclusaoInstrumento.resultado).where(
                ConclusaoInstrumento.deletado_em.is_(None)
            )
        )
    }
    for instrumento in instrumentos:
        evento_previsao = monitoramento_repo.obter_evento_mais_recente_do_marco(
            db, instrumento_id=instrumento.id, marco_id=previsao.id
        )
        evento_dispensada = monitoramento_repo.obter_evento_mais_recente_do_marco(
            db, instrumento_id=instrumento.id, marco_id=dispensada.id
        )
        resultado = resultado_por_id.get(instrumento.id)
        if instrumento.id in com_acelerador:
            if evento_dispensada is not None:
                situacao = "dispensada"
            elif evento_previsao is not None and evento_previsao.data_ocorrencia is not None:
                situacao = f"realizada em {evento_previsao.data_ocorrencia.isoformat()}"
            elif evento_previsao is not None:
                situacao = f"prevista para {evento_previsao.data_prevista}"
            else:
                situacao = "sem registro"
            aceleradores.append((instrumento.nr_convenio, f"{resultado or 'em aberto'}; inauguração {situacao}"))
            contagem["acelerador: não alterado"] += 1
            continue
        if resultado == "integral" and evento_previsao is None and evento_dispensada is None:
            contagem[
                "concluído integral sem registro -> dispensada" if aplicar else "a dispensar (concluído integral)"
            ] += 1
            if aplicar:
                novo = EventoMarco(
                    instrumento_id=instrumento.id, marco_id=dispensada.id, observacao=OBS_DISPENSADA, autor_id=None
                )
                monitoramento_repo.adicionar_evento(db, novo)
                log_action(
                    db,
                    user_id=None,
                    entity_name="instrumento_equipamento",
                    entity_id=instrumento.id,
                    action="inauguracao_dispensada_em_lote",
                    details={"nr_convenio": instrumento.nr_convenio, "evento_id": novo.id},
                )
            continue
        if (
            resultado is None
            and evento_previsao is not None
            and evento_previsao.data_ocorrencia is not None
            and evento_dispensada is None
        ):
            contagem[
                "em aberto com realizada -> sem registro" if aplicar else "a limpar (em aberto com realizada)"
            ] += 1
            if aplicar:
                evento_previsao.deletado_em = datetime.now(timezone.utc)
                evento_previsao.motivo_exclusao = MOTIVO_EXCLUSAO
                log_action(
                    db,
                    user_id=None,
                    entity_name="instrumento_equipamento",
                    entity_id=instrumento.id,
                    action="inauguracao_realizada_removida_em_lote",
                    details={
                        "nr_convenio": instrumento.nr_convenio,
                        "evento_id": evento_previsao.id,
                        "data_realizada": evento_previsao.data_ocorrencia.isoformat(),
                    },
                )
            continue
        contagem["sem alteração"] += 1
    return contagem, aceleradores


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
        contagem, aceleradores = executar(db, aplicar=args.aplicar)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    print("Alterações gravadas." if args.aplicar else "Simulação: nada foi alterado.")
    for rotulo, n in contagem.most_common():
        print(f"  {rotulo}: {n}")
    for numero, descricao in aceleradores:
        print(f"  acelerador {numero}: {descricao}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
