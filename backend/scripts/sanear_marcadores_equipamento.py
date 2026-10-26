"""Remove marcadores de equipamento que contradizem a natureza do item e cria os que faltam.

Palavra-chave em item de plano gerava marcador de família para o que o item apenas menciona
("Monitor Multiparâmetros para Ressonância Magnética" virava "Ressonância"; rendimento "para o
mamógrafo" virava mamógrafo; especificação longa citava vários equipamentos). A geração já foi
corrigida em ``app.equipamentos.classificar_descricoes``; este script aplica a mesma regra aos
marcadores existentes de item (``item_orcamentario`` e ``planilha``).

- só mexe em marcador de família do catálogo (palavra-chave ou família RENEM), nunca em item genérico;
- **remove** o marcador que a regra atual não gera para aquela descrição;
- **cria** o marcador que a regra atual gera e a origem ainda não tem (item acessório passa a ser
  marcado com o próprio nome);
- uma linha de auditoria por execução, com a lista do que saiu.

Sem ``--aplicar`` apenas simula. Idempotente.

Uso:
    python -m scripts.sanear_marcadores_equipamento
    python -m scripts.sanear_marcadores_equipamento --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import EquipamentoMarcador
from app.equipamentos import CATALOGO_EQUIPAMENTOS, classificar_descricoes
from app.equipamentos_renem import familias_controladas
from app.repositories.equipamento_marcadores import catalogo_por_codigo
from app.services.equipamento_marcadores import DadosMarcador, registrar_marcadores

TIPOS_DE_ITEM = ("item_orcamentario", "planilha")


@dataclass
class Resultado:
    removidos: int = 0
    criados: int = 0
    instrumentos: set[tuple[str, int]] = field(default_factory=set)
    removidos_por_familia: Counter[str] = field(default_factory=Counter)
    exemplos: list[str] = field(default_factory=list)


def _origem(marcador: EquipamentoMarcador) -> tuple[str, int]:
    if marcador.convenio_id is not None:
        return "convenio", marcador.convenio_id
    if marcador.proposta_candidata_id is not None:
        return "proposta_candidata", marcador.proposta_candidata_id
    return "instrumento_equipamento", int(marcador.instrumento_equipamento_id or 0)


def sanear(db: Session, *, aplicar: bool) -> Resultado:
    resultado = Resultado()
    catalogo = catalogo_por_codigo(db)
    por_id = {c.id: c for c in catalogo.values()}
    de_familia = {e.codigo for e in CATALOGO_EQUIPAMENTOS} | set(familias_controladas())
    marcadores = (
        db.execute(
            select(EquipamentoMarcador)
            .where(EquipamentoMarcador.tipo_evidencia.in_(TIPOS_DE_ITEM))
            .order_by(EquipamentoMarcador.id)
        )
        .scalars()
        .all()
    )
    esperado: dict[str, dict[str, object]] = {}
    por_origem: dict[tuple[tuple[str, int], str, str], set[str]] = {}
    for m in marcadores:
        if m.descricao_original not in esperado:
            esperado[m.descricao_original] = {e.codigo: e for e in classificar_descricoes([m.descricao_original])}
        por_origem.setdefault((_origem(m), m.descricao_original, m.tipo_evidencia), set()).add(
            por_id[m.equipamento_catalogo_id].codigo
        )
    for m in marcadores:
        codigo = por_id[m.equipamento_catalogo_id].codigo
        if codigo not in de_familia or codigo in esperado[m.descricao_original]:
            continue
        origem, origem_id = _origem(m)
        resultado.removidos += 1
        resultado.removidos_por_familia[codigo] += 1
        resultado.instrumentos.add((origem, origem_id))
        if len(resultado.exemplos) < 8:
            resultado.exemplos.append(f"{codigo} <- {m.descricao_original[:70]}")
        if aplicar:
            db.delete(m)
    if aplicar:
        db.flush()
    for (origem_id_par, descricao, tipo), presentes in por_origem.items():
        origem, origem_id = origem_id_par
        faltam = [e for c, e in esperado[descricao].items() if c not in presentes]
        if not faltam:
            continue
        resultado.criados += len(faltam)
        resultado.instrumentos.add(origem_id_par)
        if aplicar:
            registrar_marcadores(
                db=db,
                origem=origem,  # type: ignore[arg-type]
                origem_id=origem_id,
                marcadores=[
                    DadosMarcador(
                        evidencia=e,  # type: ignore[arg-type]
                        tipo_evidencia=tipo,  # type: ignore[arg-type]
                        confianca=90,
                        origem_dado="saneamento de marcador por natureza do item",
                    )
                    for e in faltam
                ],
                catalogo=catalogo,
            )
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
        resultado = sanear(db, aplicar=args.aplicar)
        if args.aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="equipamento_marcador",
                entity_id=0,
                action="sanear_marcadores_equipamento",
                details={
                    "removidos": resultado.removidos,
                    "criados": resultado.criados,
                    "por_familia": dict(resultado.removidos_por_familia),
                },
            )
            db.commit()
        else:
            db.rollback()
    modo = "gravado" if args.aplicar else "simulação, nada foi alterado"
    print(f"Marcadores removidos: {resultado.removidos}; criados: {resultado.criados} ({modo})")
    print(f"  instrumentos/propostas afetados: {len(resultado.instrumentos)}")
    for familia, n in resultado.removidos_por_familia.most_common():
        print(f"    - {familia}: {n}")
    for exemplo in resultado.exemplos:
        print(f"    ex.: {exemplo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
