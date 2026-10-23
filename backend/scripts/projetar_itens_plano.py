"""Projeta os itens do plano de aplicação dos convênios na tabela `item_plano`.

- **API (SICONV)**: um `item_plano` por `ID_ITEM_PAD` (origem `siconv`); itens `OBRA`/`SERVICO` ficam de fora.
- **Carga manual** (PERSUS, FAF, TED): `id_origem = manual:{numero}:{ordem}`, quantidade 1. Os itens manuais de
  "Convênio" repetem a API e não viram item.
- **Classificação**: motor de `app.classificacao_itens` + decisão vigente (`decisao_classificacao_item`), que
  prevalece. Só `aquisicao` com `conta_unidade` em família do catálogo controlada por unidade vira
  `controla_unidade`; decisão `pendente` nunca controla.
- **Código das cargas manuais**: código no texto presente na RENEM ou no legado -> nome idêntico a um único item da
  RENEM -> regra da equipe (acelerador de PERSUS I/II = 011806) -> família com código a definir. Nunca por
  semelhança de valor ou de nome.
- Reexecutar não duplica; código escolhido pela equipe (`definido_pela_equipe`) nunca é sobrescrito; item que sumiu da
  fonte vira `ativo=false`, sem apagar.

Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.projetar_itens_plano
    python -m scripts.projetar_itens_plano --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
import hashlib
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.classificacao_itens import classificar
from app.db.base import SessionLocal, engine
from app.db.models import (
    CodigoItemLegado,
    Convenio,
    DecisaoClassificacaoItem,
    EquipamentoCatalogo,
    InstrumentoEquipamento,
    ItemPlano,
    RenemItem,
)
from app.equipamentos import normalizar_texto
from app.equipamentos_renem import classificar_item, extrair_codigo
from app.pipeline.itens_plano import item_conta_como_equipamento
from scripts.importar_revisao_classificacao import chave_do_item

CODIGO_ACELERADOR_PERSUS = "011806"
TIPOS_PERSUS = frozenset({"PERSUS I", "PERSUS II"})


@dataclass
class Contexto:
    catalogo_por_codigo: dict[str, EquipamentoCatalogo]
    catalogo_por_id: dict[int, EquipamentoCatalogo]
    catalogo_do_codigo: dict[str, int | None]  # código RENEM/legado -> catalogo_id
    codigos_validos: set[str]
    codigo_por_nome: dict[str, str | None]  # nome normalizado -> código único (None = ambíguo)
    decisoes: dict[tuple[str, str], DecisaoClassificacaoItem]
    instrumentos: dict[str, int]


@dataclass
class Alvo:
    codigo_item: str | None
    codigo_fonte: str | None
    catalogo_id: int | None
    controla_unidade: bool
    familia: str | None


@dataclass
class Resultado:
    criados: int = 0
    atualizados: int = 0
    inalterados: int = 0
    desativados: int = 0
    ignorados_obra_servico: int = 0
    ignorados_manual_repetido: int = 0
    por_origem: Counter[str] = field(default_factory=Counter)
    por_familia: Counter[str] = field(default_factory=Counter)
    sem_familia: int = 0
    codigo_a_definir: int = 0
    manual_por_codigo_fonte: Counter[str] = field(default_factory=Counter)


def carregar_contexto(db: Session) -> Contexto:
    catalogo = list(db.execute(select(EquipamentoCatalogo)).scalars())
    renem = list(db.execute(select(RenemItem)).scalars())
    legados = list(db.execute(select(CodigoItemLegado)).scalars())
    nomes: dict[str, str | None] = {}
    for r in renem:
        chave = normalizar_texto(r.nome)
        nomes[chave] = r.codigo_item if nomes.get(chave, r.codigo_item) == r.codigo_item else None
    decisoes = {
        (d.convenio_numero, d.chave_item): d
        for d in db.execute(
            select(DecisaoClassificacaoItem).where(DecisaoClassificacaoItem.substituida_por_id.is_(None))
        ).scalars()
    }
    return Contexto(
        catalogo_por_codigo={c.codigo: c for c in catalogo},
        catalogo_por_id={c.id: c for c in catalogo},
        catalogo_do_codigo={
            **{r.codigo_item: r.catalogo_id for r in renem},
            **{legado.codigo_item: legado.catalogo_id for legado in legados},
        },
        codigos_validos={r.codigo_item for r in renem} | {legado.codigo_item for legado in legados},
        codigo_por_nome=nomes,
        decisoes=decisoes,
        instrumentos={
            nr: id_ for nr, id_ in db.execute(select(InstrumentoEquipamento.nr_convenio, InstrumentoEquipamento.id))
        },
    )


def _controla(ctx: Contexto, catalogo_id: int | None, *, conta: bool | None, pendente: bool = False) -> bool:
    if not conta or pendente or catalogo_id is None:
        return False
    return ctx.catalogo_por_id[catalogo_id].controle_por_unidade


def alvo_item_api(ctx: Contexto, convenio_numero: str, item: dict) -> Alvo:
    descricao = str(item.get("DESCRICAO_ITEM") or "")
    valor = _decimal(item.get("VALOR_TOTAL_ITEM"))
    motor = classificar(descricao, valor_total=valor)
    decisao = ctx.decisoes.get((convenio_numero, chave_do_item(item)))
    tipo: str = motor.tipo
    codigo, conta, familia = motor.codigo_item, motor.conta_unidade, motor.familia
    fonte = "descricao" if codigo else None
    pendente = motor.confianca != "alta"
    if decisao is not None:
        tipo, conta, pendente = decisao.tipo_lancamento, decisao.conta_unidade, decisao.status == "pendente"
        if decisao.codigo_item:
            codigo = decisao.codigo_item
            fonte = "definido_pela_equipe" if decisao.origem != "motor" else "descricao"
        familia = _familia_do_codigo(ctx, codigo) or familia
    catalogo = ctx.catalogo_por_codigo.get(familia or "")
    catalogo_id = catalogo.id if catalogo else ctx.catalogo_do_codigo.get(codigo or "")
    if tipo != "aquisicao":
        conta = False
    return Alvo(codigo, fonte, catalogo_id, _controla(ctx, catalogo_id, conta=conta, pendente=pendente), familia)


def _familia_do_codigo(ctx: Contexto, codigo: str | None) -> str | None:
    catalogo_id = ctx.catalogo_do_codigo.get(codigo or "")
    return ctx.catalogo_por_id[catalogo_id].codigo if catalogo_id else None


def alvo_item_manual(ctx: Contexto, tipo_contratacao: str | None, item: dict) -> Alvo:
    descricao = str(item.get("DESCRICAO_ITEM") or "")
    texto = normalizar_texto(descricao)
    base = classificar_item(descricao)
    codigo = extrair_codigo(descricao)
    fonte: str | None = None
    if codigo is not None and codigo in ctx.codigos_validos:
        fonte = "descricao"
    else:
        codigo = None
        por_nome = ctx.codigo_por_nome.get(texto)
        if por_nome:
            codigo, fonte = por_nome, "nome_renem"
        elif tipo_contratacao in TIPOS_PERSUS and texto == "ACELERADOR LINEAR":
            codigo, fonte = CODIGO_ACELERADOR_PERSUS, "regra_da_equipe"
    familia = _familia_do_codigo(ctx, codigo) or base.familia
    catalogo = ctx.catalogo_por_codigo.get(familia or "")
    catalogo_id = catalogo.id if catalogo else ctx.catalogo_do_codigo.get(codigo or "")
    return Alvo(codigo, fonte, catalogo_id, _controla(ctx, catalogo_id, conta=bool(familia)), familia)


def _decimal(valor: object) -> float | None:
    try:
        return float(str(valor).replace(",", ".")) if valor not in (None, "") else None
    except ValueError:
        return None


def _quantidade(valor: object) -> int | None:
    n = _decimal(valor)
    return max(1, round(n)) if n else None


def _hash(item: dict) -> str:
    base = "|".join(str(item.get(k) or "") for k in ("DESCRICAO_ITEM", "QTD_ITEM", "VALOR_TOTAL_ITEM"))
    return hashlib.sha256(base.encode()).hexdigest()[:32]


def _sincronizar(db: Session, existente: ItemPlano | None, novo: dict, resultado: Resultado, aplicar: bool) -> None:
    if existente is None:
        resultado.criados += 1
        if aplicar:
            db.add(ItemPlano(**novo))
        return
    mudancas = {}
    for campo, valor in novo.items():
        if campo in ("codigo_item", "codigo_fonte") and existente.codigo_fonte == "definido_pela_equipe":
            continue
        if getattr(existente, campo) != valor:
            mudancas[campo] = valor
    if not existente.ativo:
        mudancas.update(ativo=True, removido_na_fonte_em=None)
    if not mudancas:
        resultado.inalterados += 1
        return
    resultado.atualizados += 1
    if aplicar:
        for campo, valor in mudancas.items():
            setattr(existente, campo, valor)
        existente.atualizado_em = datetime.now(UTC)


def projetar(db: Session, *, aplicar: bool) -> Resultado:
    resultado = Resultado()
    ctx = carregar_contexto(db)
    existentes = {(i.origem, i.id_origem): i for i in db.execute(select(ItemPlano)).scalars()}
    vistos: set[tuple[str, str]] = set()
    for convenio in db.execute(select(Convenio).order_by(Convenio.id)).scalars():
        itens = (convenio.siconv_raw or {}).get("itens_plano_aplicacao") or []
        ordem_manual = 0
        for item in itens:
            if not isinstance(item, dict):
                continue
            if not item_conta_como_equipamento(item):
                resultado.ignorados_obra_servico += 1
                continue
            manual = not item.get("ID_ITEM_PAD")
            if manual:
                ordem_manual += 1
                if convenio.tipo_contratacao == "Convênio":
                    resultado.ignorados_manual_repetido += 1
                    continue
                origem, id_origem = "manual", f"manual:{convenio.numero}:{ordem_manual}"
                alvo = alvo_item_manual(ctx, convenio.tipo_contratacao, item)
                quantidade: int | None = 1
            else:
                origem, id_origem = "siconv", str(item["ID_ITEM_PAD"])
                alvo = alvo_item_api(ctx, convenio.numero, item)
                quantidade = _quantidade(item.get("QTD_ITEM"))
            chave = (origem, id_origem)
            if chave in vistos:
                continue
            vistos.add(chave)
            resultado.por_origem[origem] += 1
            if alvo.controla_unidade and alvo.familia:
                resultado.por_familia[alvo.familia] += 1
            if alvo.familia is None:
                resultado.sem_familia += 1
            elif alvo.codigo_item is None:
                resultado.codigo_a_definir += 1
            if manual:
                resultado.manual_por_codigo_fonte[alvo.codigo_fonte or "a definir"] += 1
            novo = dict(
                convenio_id=convenio.id,
                instrumento_id=ctx.instrumentos.get(convenio.numero),
                origem=origem,
                id_origem=id_origem,
                codigo_item=alvo.codigo_item,
                codigo_fonte=alvo.codigo_fonte,
                descricao=str(item.get("DESCRICAO_ITEM") or "").strip(),
                catalogo_id=alvo.catalogo_id,
                controla_unidade=alvo.controla_unidade,
                quantidade_planejada=quantidade,
                hash_conteudo=_hash(item),
            )
            _sincronizar(db, existentes.get(chave), novo, resultado, aplicar)
    agora = datetime.now(UTC)
    for chave, existente in existentes.items():
        if chave not in vistos and existente.ativo and existente.origem == "siconv":
            resultado.desativados += 1
            if aplicar:
                existente.ativo = False
                existente.removido_na_fonte_em = agora
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
        r = projetar(db, aplicar=args.aplicar)
        if args.aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="item_plano",
                entity_id=0,
                action="projetar_itens_plano",
                details={"criados": r.criados, "atualizados": r.atualizados, "desativados": r.desativados},
            )
            db.commit()
        else:
            db.rollback()
    print("Itens gravados." if args.aplicar else "Simulação: nada foi alterado.")
    print(
        f"  criados {r.criados}; atualizados {r.atualizados}; inalterados {r.inalterados}; desativados {r.desativados}"
    )
    print(
        f"  ignorados: obra/serviço {r.ignorados_obra_servico}; manuais de convênio que repetem a API {r.ignorados_manual_repetido}"
    )
    print(f"  por origem: {dict(r.por_origem)}")
    print(f"  sem família: {r.sem_familia}; família com código a definir: {r.codigo_a_definir}")
    print(f"  manuais por fonte do código: {dict(r.manual_por_codigo_fonte)}")
    print("  controlados por unidade, por família:")
    for familia, n in r.por_familia.most_common():
        print(f"    {familia}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
