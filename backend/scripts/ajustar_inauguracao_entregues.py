"""Ajusta a resposta sobre inauguração dos instrumentos (exceto os com Acelerador Linear).

Regras (decisão do usuário, 24/11/2026), por instrumento no escopo:

Instrumento **sem** Acelerador Linear:
- inauguração realizada em instrumento sem conclusão ativa (em aberto): o lançamento da realizada é excluído com
  motivo (soft delete, nunca físico) e, em seguida, vale a regra abaixo;
- sem nenhum registro de inauguração (nem previsão, nem realizada, nem dispensada) e concluído integral **ou** com
  equipamento entregue: grava "Inauguração dispensada";
- previsão pendente, dispensada, ou instrumento sem conclusão e sem entrega: fica como está.

Instrumento **com** Acelerador Linear:
- concluído integral e sem nenhum registro de inauguração: grava a inauguração **realizada** com a data da primeira
  entrega do acelerador (nunca no futuro);
- qualquer outro caso: não altera; a lista sai no final.

Idempotente. Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.ajustar_inauguracao_entregues
    python -m scripts.ajustar_inauguracao_entregues --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime, timezone

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
OBS_DISPENSADA = "Dispensada: ajuste em lote, instrumento sem registro de inauguração"
OBS_REALIZADA = "Inauguração realizada: data da entrega do acelerador, copiada em lote"
MOTIVO_EXCLUSAO = "Ajuste em lote: instrumento em aberto, inauguração realizada substituída pela resposta de dispensa"


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
    com_entrega = set(etapas_repo.primeira_entrega_por_instrumento(db, ids))
    entrega_acelerador = etapas_repo.primeira_entrega_de_acelerador(db, ids)
    resultado_por_id = {
        instrumento_id: resultado
        for instrumento_id, resultado in db.execute(
            select(ConclusaoInstrumento.instrumento_id, ConclusaoInstrumento.resultado).where(
                ConclusaoInstrumento.deletado_em.is_(None)
            )
        )
    }
    hoje = date.today()
    for instrumento in instrumentos:
        evento_previsao = monitoramento_repo.obter_evento_mais_recente_do_marco(
            db, instrumento_id=instrumento.id, marco_id=previsao.id
        )
        evento_dispensada = monitoramento_repo.obter_evento_mais_recente_do_marco(
            db, instrumento_id=instrumento.id, marco_id=dispensada.id
        )
        resultado = resultado_por_id.get(instrumento.id)
        sem_registro = evento_previsao is None and evento_dispensada is None
        if instrumento.id in com_acelerador:
            data = entrega_acelerador.get(instrumento.id)
            if resultado == "integral" and sem_registro and data is not None and data <= hoje:
                contagem["acelerador concluído sem registro -> realizada na data da entrega"] += 1
                if aplicar:
                    novo = EventoMarco(
                        instrumento_id=instrumento.id,
                        marco_id=previsao.id,
                        data_ocorrencia=data,
                        observacao=OBS_REALIZADA,
                        autor_id=None,
                    )
                    monitoramento_repo.adicionar_evento(db, novo)
                    _auditar(
                        db, instrumento, "inauguracao_realizada_pela_entrega_em_lote", novo.id, data=data.isoformat()
                    )
                continue
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
        if resultado is None and evento_previsao is not None and evento_previsao.data_ocorrencia is not None:
            contagem["em aberto com realizada -> removida"] += 1
            if aplicar:
                evento_previsao.deletado_em = datetime.now(timezone.utc)
                evento_previsao.motivo_exclusao = MOTIVO_EXCLUSAO
                _auditar(
                    db,
                    instrumento,
                    "inauguracao_realizada_removida_em_lote",
                    evento_previsao.id,
                    data_realizada=evento_previsao.data_ocorrencia.isoformat(),
                )
            evento_previsao = None
            sem_registro = evento_dispensada is None
        if sem_registro and (resultado == "integral" or instrumento.id in com_entrega):
            contagem["sem registro -> dispensada"] += 1
            if aplicar:
                novo = EventoMarco(
                    instrumento_id=instrumento.id, marco_id=dispensada.id, observacao=OBS_DISPENSADA, autor_id=None
                )
                monitoramento_repo.adicionar_evento(db, novo)
                _auditar(db, instrumento, "inauguracao_dispensada_em_lote", novo.id)
            continue
        contagem["sem alteração"] += 1
    return contagem, aceleradores


def _auditar(db: Session, instrumento: InstrumentoEquipamento, acao: str, evento_id: int, **extra: str) -> None:
    log_action(
        db,
        user_id=None,
        entity_name="instrumento_equipamento",
        entity_id=instrumento.id,
        action=acao,
        details={"nr_convenio": instrumento.nr_convenio, "evento_id": evento_id, **extra},
    )


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
