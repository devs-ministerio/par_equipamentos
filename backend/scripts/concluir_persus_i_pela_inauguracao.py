"""PERSUS I: conclui o acompanhamento na data da inauguração realizada.

Rodar depois de `corrigir_entregas_persus_i` (que lança a entrega com a data da inauguração). Para cada instrumento
PERSUS I **que já tiveram conclusão antiga** (evento `fase_concluido`, ativo ou desfeito pela migração), sem conclusão
ativa e com inauguração **realizada** (marco `cronograma_previsao_inauguracao` ativo com
`data_ocorrencia`):

- sem impedimento e com resultado integral: grava a conclusão com `data_conclusao` e `data_inauguracao` iguais à
  data da inauguração (nunca no futuro), por `autor_id` nulo, com `AuditLog`;
- qualquer outro caso (item pendente, ação aberta, sem item controlado, resultado parcial ou sem entregas, sem
  inauguração realizada): não conclui e fica na lista final.

Não mexe no evento antigo `fase_concluido`: se existir, Reabrir o desfaz junto com a conclusão. Idempotente. Sem
``--aplicar`` apenas simula.

Uso:
    python -m scripts.concluir_persus_i_pela_inauguracao
    python -m scripts.concluir_persus_i_pela_inauguracao --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import date

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import ConclusaoInstrumento, EventoMarco, InstrumentoEquipamento, MarcoCatalogo
from app.repositories import conclusoes as conclusoes_repo
from app.repositories import monitoramento as monitoramento_repo
from app.services.conclusao_acompanhamento import _impedimentos, _itens_controlados, calcular_resultado

MARCO_INAUGURACAO = "cronograma_previsao_inauguracao"
MARCO_CONCLUIDO = "fase_concluido"
TIPO = "PERSUS I"


def executar(db: Session, *, aplicar: bool) -> tuple[Counter[str], list[tuple[str, str]]]:
    contagem: Counter[str] = Counter()
    ficam: list[tuple[str, str]] = []
    marco = monitoramento_repo.obter_marco_por_codigo(db, MARCO_INAUGURACAO)
    if marco is None:
        raise RuntimeError("Marco de inauguração não encontrado no catálogo.")
    instrumentos = db.scalars(
        select(InstrumentoEquipamento)
        .where(InstrumentoEquipamento.tipo_contratacao == TIPO)
        .order_by(InstrumentoEquipamento.id)
    ).all()
    com_conclusao_antiga = set(
        db.scalars(
            select(EventoMarco.instrumento_id)
            .join(MarcoCatalogo, MarcoCatalogo.id == EventoMarco.marco_id)
            .where(MarcoCatalogo.codigo == MARCO_CONCLUIDO, EventoMarco.substituido_por_id.is_(None))
        )
    )
    for instrumento in instrumentos:
        if instrumento.id not in com_conclusao_antiga and not conclusoes_repo.existe_ativa(db, instrumento.id):
            contagem["fora do escopo: nunca concluído"] += 1
            continue
        if conclusoes_repo.existe_ativa(db, instrumento.id):
            contagem["já concluído"] += 1
            continue
        evento = monitoramento_repo.obter_evento_mais_recente_do_marco(
            db, instrumento_id=instrumento.id, marco_id=marco.id
        )
        data = evento.data_ocorrencia if evento is not None else None
        if data is None:
            contagem["fica: sem inauguração realizada"] += 1
            ficam.append((instrumento.nr_convenio, "sem inauguração realizada"))
            continue
        if data > date.today():
            contagem["fica: inauguração no futuro"] += 1
            ficam.append((instrumento.nr_convenio, "data de inauguração no futuro"))
            continue
        itens = _itens_controlados(db, instrumento.id)
        impedimentos = sorted({i.tipo for i in _impedimentos(db, instrumento.id, itens)})
        resultado = calcular_resultado(itens)
        if impedimentos or resultado != "integral":
            motivo = ", ".join(impedimentos) if impedimentos else f"resultado {resultado}"
            contagem["fica: com pendência"] += 1
            ficam.append((instrumento.nr_convenio, motivo))
            continue
        contagem["concluído" if aplicar else "a concluir"] += 1
        if not aplicar:
            continue
        conclusao = ConclusaoInstrumento(
            instrumento_id=instrumento.id,
            resultado="integral",
            data_conclusao=data,
            data_inauguracao=data,
            autor_id=None,
        )
        conclusoes_repo.adicionar(db, conclusao)
        log_action(
            db,
            user_id=None,
            entity_name="conclusao_instrumento",
            entity_id=conclusao.id,
            action="created",
            details={
                "nr_convenio": instrumento.nr_convenio,
                "resultado": "integral",
                "data_conclusao": data.isoformat(),
                "origem": "persus_i_inauguracao",
            },
        )
    return contagem, ficam


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
        contagem, ficam = executar(db, aplicar=args.aplicar)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    print("Conclusões gravadas." if args.aplicar else "Simulação: nada foi alterado.")
    for rotulo, n in contagem.most_common():
        print(f"  {rotulo}: {n}")
    for numero, motivo in ficam:
        print(f"  fica {numero}: {motivo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
