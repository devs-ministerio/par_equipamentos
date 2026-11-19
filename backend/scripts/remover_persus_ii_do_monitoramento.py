"""Tira do monitoramento interno os instrumentos cujo convênio é PERSUS II.

PERSUS II está em contratação e fora do monitoramento por decisão da equipe. Em 18/11/2026 havia 24 instrumentos
monitorados tipados como "Convênio" cujo `convenio` de mesmo número é PERSUS II.

- Só remove instrumento sem nenhum lançamento (eventos, ações, entregas, repasses, conclusões, documentos, revisões
  de entrega). Quem tem lançamento fica de fora e é listado: nunca se apaga histórico.
- Os itens do plano apenas perdem o vínculo (`instrumento_id` nulo); a projeção do convênio continua valendo.
- `AuditLog` por instrumento antes do delete (precedente do 877881). Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.remover_persus_ii_do_monitoramento
    python -m scripts.remover_persus_ii_do_monitoramento --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter

from sqlalchemy import func, select, update
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import (
    AcaoMonitoramento,
    ConclusaoInstrumento,
    Convenio,
    DocumentoInstrumento,
    EntregaEquipamento,
    EntregaLegadaRevisao,
    EventoMarco,
    InstrumentoEquipamento,
    ItemPlano,
    RepasseInstrumento,
)

# Tabelas cujo conteúdo impede a remoção (histórico que não se apaga).
_LANCAMENTOS = (
    ("eventos", EventoMarco),
    ("acoes", AcaoMonitoramento),
    ("entregas", EntregaEquipamento),
    ("repasses", RepasseInstrumento),
    ("conclusoes", ConclusaoInstrumento),
    ("documentos", DocumentoInstrumento),
    ("revisoes_entrega", EntregaLegadaRevisao),
)


def _lancamentos(db: Session, instrumento_id: int) -> dict[str, int]:
    encontrados = {}
    for nome, modelo in _LANCAMENTOS:
        quantidade = db.scalar(select(func.count()).select_from(modelo).where(modelo.instrumento_id == instrumento_id))
        if quantidade:
            encontrados[nome] = quantidade
    return encontrados


def executar(db: Session, *, aplicar: bool) -> Counter[str]:
    contagem: Counter[str] = Counter()
    instrumentos = db.scalars(
        select(InstrumentoEquipamento)
        .join(Convenio, Convenio.numero == InstrumentoEquipamento.nr_convenio)
        .where(Convenio.tipo_contratacao == "PERSUS II")
        .order_by(InstrumentoEquipamento.id)
    ).all()
    for instrumento in instrumentos:
        bloqueio = _lancamentos(db, instrumento.id)
        if bloqueio:
            contagem["bloqueado (tem lançamento)"] += 1
            print(f"  {instrumento.nr_convenio}: mantido, tem {bloqueio}")
            continue
        contagem["removido" if aplicar else "a remover"] += 1
        if not aplicar:
            continue
        log_action(
            db,
            user_id=None,
            entity_name="instrumento_equipamento",
            entity_id=instrumento.id,
            action="removed_by_request",
            details={
                "nr_convenio": instrumento.nr_convenio,
                "tipo_contratacao": instrumento.tipo_contratacao,
                "motivo": "PERSUS II fora do monitoramento interno (decisão de 18/11/2026)",
            },
        )
        db.execute(update(ItemPlano).where(ItemPlano.instrumento_id == instrumento.id).values(instrumento_id=None))
        db.delete(instrumento)
    return contagem


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
        contagem = executar(db, aplicar=args.aplicar)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    print("Instrumentos removidos." if args.aplicar else "Simulação: nada foi alterado.")
    for rotulo, n in contagem.most_common():
        print(f"  {rotulo}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
