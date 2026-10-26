"""Religa os marcadores de equipamento às 16 famílias pelo código RENEM do item.

Hoje os itens de "Endoscopia", "Ultrassom" e "Tomógrafo" estão em linhas genéricas do
catálogo e a classificação por palavra marca acessórios como se fossem o equipamento. Este
script:

- **religa** o marcador cujo item é classificado numa família (por código ou nome) à linha
  da família, recalculando `chave_evidencia` (que inclui o código) para a próxima carga
  reconhecer a mesma evidência e não duplicar;
- **não apaga** nenhum marcador; se o destino já existir, pula e informa;
- **cria** o marcador que falta quando um item de bem do convênio é classificado numa família e ainda
  não tem marcador com a mesma descrição (por exemplo Arco Cirúrgico e Colposcópio, que não tinham
  palavra-chave);
- **lista como suspeitos** os marcadores de família controlada cujo item NÃO é classificado
  nela (por exemplo "Monitor Multiparâmetros para Ressonância Magnética"), para revisão.

Sem ``--aplicar`` apenas simula. Idempotente. Uma linha de auditoria por execução.

Uso:
    python -m scripts.reclassificar_marcadores_por_codigo
    python -m scripts.reclassificar_marcadores_por_codigo --aplicar --confirmo-host HOST
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
from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador
from app.equipamentos import relacao_da_descricao
from app.equipamentos_renem import classificar_item, familias_controladas
from app.pipeline.itens_plano import item_conta_como_equipamento
from app.services.equipamento_marcadores import chave_da_evidencia


@dataclass
class Resultado:
    religados: int = 0
    criados: int = 0
    ja_corretos: int = 0
    colisoes: int = 0
    por_familia: Counter[str] = field(default_factory=Counter)
    suspeitos: Counter[str] = field(default_factory=Counter)
    exemplos_suspeitos: dict[str, list[str]] = field(default_factory=dict)


def _origem(marcador: EquipamentoMarcador) -> tuple[str, int]:
    if marcador.convenio_id is not None:
        return "convenio", marcador.convenio_id
    if marcador.proposta_candidata_id is not None:
        return "proposta_candidata", marcador.proposta_candidata_id
    return "instrumento_equipamento", int(marcador.instrumento_equipamento_id or 0)


def reclassificar(db: Session, *, aplicar: bool) -> Resultado:
    resultado = Resultado()
    catalogo = {c.codigo: c for c in db.execute(select(EquipamentoCatalogo)).scalars()}
    por_id = {c.id: c for c in catalogo.values()}
    controladas = set(familias_controladas())
    marcadores = db.execute(select(EquipamentoMarcador).order_by(EquipamentoMarcador.id)).scalars().all()
    existentes = {(_origem(m), m.equipamento_catalogo_id, m.chave_evidencia) for m in marcadores}
    for marcador in marcadores:
        classificacao = classificar_item(marcador.descricao_original)
        atual = por_id[marcador.equipamento_catalogo_id]
        if classificacao.familia is None:
            if atual.codigo in controladas:
                resultado.suspeitos[atual.codigo] += 1
                lista = resultado.exemplos_suspeitos.setdefault(atual.codigo, [])
                if len(lista) < 4:
                    lista.append(marcador.descricao_original[:80])
            continue
        destino = catalogo.get(classificacao.familia)
        if destino is None:
            continue
        if marcador.equipamento_catalogo_id == destino.id:
            resultado.ja_corretos += 1
            continue
        origem, origem_id = _origem(marcador)
        nova_chave = chave_da_evidencia(
            origem=origem,  # type: ignore[arg-type]
            origem_id=origem_id,
            codigo=destino.codigo,
            descricao=marcador.descricao_original,
            tipo_evidencia=marcador.tipo_evidencia,  # type: ignore[arg-type]
        )
        if ((origem, origem_id), destino.id, nova_chave) in existentes:
            resultado.colisoes += 1
            continue
        resultado.religados += 1
        resultado.por_familia[destino.codigo] += 1
        if aplicar:
            existentes.discard(((origem, origem_id), marcador.equipamento_catalogo_id, marcador.chave_evidencia))
            marcador.equipamento_catalogo_id = destino.id
            marcador.chave_evidencia = nova_chave
            existentes.add(((origem, origem_id), destino.id, nova_chave))
    _criar_faltantes(db, resultado, catalogo, aplicar=aplicar)
    return resultado


def _criar_faltantes(db: Session, resultado: Resultado, catalogo: dict, *, aplicar: bool) -> None:
    com_marcador = {
        (m.convenio_id, m.descricao_original)
        for m in db.execute(select(EquipamentoMarcador).where(EquipamentoMarcador.convenio_id.is_not(None))).scalars()
    }
    for convenio in db.execute(select(Convenio)).scalars():
        for item in (convenio.siconv_raw or {}).get("itens_plano_aplicacao") or []:
            if not isinstance(item, dict) or not item_conta_como_equipamento(item):
                continue
            descricao = str(item.get("DESCRICAO_ITEM") or "")
            classificacao = classificar_item(descricao)
            destino = catalogo.get(classificacao.familia or "")
            if destino is None or (convenio.id, descricao) in com_marcador:
                continue
            resultado.criados += 1
            resultado.por_familia[destino.codigo] += 1
            com_marcador.add((convenio.id, descricao))
            if aplicar:
                db.add(
                    EquipamentoMarcador(
                        convenio_id=convenio.id,
                        equipamento_catalogo_id=destino.id,
                        descricao_original=descricao.strip(),
                        tipo_evidencia="item_orcamentario",
                        relacao=relacao_da_descricao(descricao),
                        confianca=100 if classificacao.fonte.startswith("codigo") else 90,
                        chave_evidencia=chave_da_evidencia(
                            origem="convenio",
                            origem_id=convenio.id,
                            codigo=destino.codigo,
                            descricao=descricao,
                            tipo_evidencia="item_orcamentario",
                        ),
                        origem_dado="reclassificacao por codigo RENEM",
                    )
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
    with SessionLocal() as db:
        resultado = reclassificar(db, aplicar=args.aplicar)
        if args.aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="equipamento_marcador",
                entity_id=0,
                action="reclassificar_marcadores_por_codigo",
                details={
                    "religados": resultado.religados,
                    "criados": resultado.criados,
                    "por_familia": dict(resultado.por_familia),
                },
            )
            db.commit()
        else:
            db.rollback()
    modo = "religados" if args.aplicar else "a religar (simulação, nada foi alterado)"
    print(f"Marcadores {modo}: {resultado.religados}; criados (item sem marcador): {resultado.criados}")
    print(f"  já na família correta: {resultado.ja_corretos}; colisões (puladas): {resultado.colisoes}")
    for familia, n in resultado.por_familia.most_common():
        print(f"    -> {familia}: {n}")
    print("  suspeitos (marcador de família controlada em item que não é o equipamento):")
    for familia, n in resultado.suspeitos.most_common():
        print(f"    {familia}: {n}  ex.: {resultado.exemplos_suspeitos[familia]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
