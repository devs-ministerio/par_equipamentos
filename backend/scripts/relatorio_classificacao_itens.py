"""Relatório (somente leitura) de como os itens do plano de aplicação caem nas 16 famílias.

Classifica cada item de bem (sem `OBRA`/`SERVICO`) de `Convenio.siconv_raw` pelo código RENEM,
com o nome exato como segunda chance, e mostra: itens, convênios e unidades por família, a
origem da classificação, e o que ficou de fora para revisão humana (texto com dois
equipamentos, código fora das famílias que cita uma delas no nome, e nomes divergentes).

Uso:
    python -m scripts.relatorio_classificacao_itens
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio
from app.equipamentos import normalizar_texto
from app.equipamentos_renem import FAMILIAS, classificar_item, extrair_codigo
from app.pipeline.itens_plano import item_conta_como_equipamento
from app.pipeline.texto import parsear_valor_brasileiro

_PALAVRAS_DAS_FAMILIAS = re.compile(
    r"MAMOGRAF|COLPOSC|ENDOSC|ULTRA\s*SS?OM|SIMULADOR|TOMOGRAF|RESSONANC|\bPET\b|CINTILOGR|GAMA\s*CAMARA|"
    r"ACELERAD|BRAQUITERAPIA|ARCO\s*CIR|ROBOT"
)


def _unidades(item: dict) -> int:
    valor = parsear_valor_brasileiro(item.get("QTD_ITEM"))
    return int(valor) if valor is not None and valor >= 1 else 1


def gerar() -> dict:
    por_familia: dict[str, dict] = defaultdict(lambda: {"itens": 0, "convenios": set(), "unidades": 0})
    fontes: Counter[str] = Counter()
    multiplos: list[str] = []
    citam_familia_sem_ser: Counter[str] = Counter()
    with SessionLocal() as db:
        for numero, bruto in db.execute(select(Convenio.numero, Convenio.siconv_raw)):
            for item in (bruto or {}).get("itens_plano_aplicacao") or []:
                if not isinstance(item, dict) or not item_conta_como_equipamento(item):
                    continue
                descricao = str(item.get("DESCRICAO_ITEM") or "")
                resultado = classificar_item(descricao)
                fontes[resultado.fonte] += 1
                if resultado.familia:
                    dados = por_familia[resultado.familia]
                    dados["itens"] += 1
                    dados["convenios"].add(numero)
                    dados["unidades"] += _unidades(item)
                elif resultado.fonte == "multiplo":
                    multiplos.append(f"{numero}: {descricao[:90]}")
                elif _PALAVRAS_DAS_FAMILIAS.search(normalizar_texto(descricao)):
                    codigo = extrair_codigo(descricao) or "sem código"
                    nome = re.sub(r"^\s*(?:C[OÓ]D\.?\s*)?\d+\s*[-–.:]?\s*", "", descricao)[:70]
                    citam_familia_sem_ser[f"{codigo} | {nome}"] += 1
    return {
        "por_familia": por_familia,
        "fontes": fontes,
        "multiplos": multiplos,
        "citam_familia_sem_ser": citam_familia_sem_ser,
    }


def main() -> int:
    dados = gerar()
    print("== Itens por família (somente itens de bem)")
    print(f"{'família':52s} {'itens':>6s} {'conv.':>6s} {'unid.':>6s}")
    for familia in FAMILIAS:
        d = dados["por_familia"].get(familia.catalogo_codigo)
        if d:
            print(f"{familia.nome_oficial[:52]:52s} {d['itens']:6d} {len(d['convenios']):6d} {d['unidades']:6d}")
        else:
            print(f"{familia.nome_oficial[:52]:52s} {0:6d} {0:6d} {0:6d}")
    print("\n== Origem da classificação (todos os itens de bem)")
    for fonte, n in dados["fontes"].most_common():
        print(f"  {fonte}: {n}")
    print(f"\n== Texto com dois equipamentos ({len(dados['multiplos'])}), para revisão")
    for linha in dados["multiplos"][:15]:
        print(f"  {linha}")
    print("\n== Citam uma das famílias no nome mas ficaram de fora (variantes e acessórios), por código")
    for chave, n in dados["citam_familia_sem_ser"].most_common(25):
        print(f"  {n:4d} x {chave}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
