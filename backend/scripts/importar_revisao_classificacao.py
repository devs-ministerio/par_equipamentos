"""Importa a revisão da equipe (aba "Sem código – decisão") como decisões de classificação.

Cada linha vira uma `DecisaoClassificacaoItem` com origem `revisao_equipe`:
- Avaliação OK/ERRO/AJUSTE com código indicado -> status `aplicada`;
- VERIFICAR (ou sem código/tipo reconhecido) -> status `pendente` (fila de revisão).

O item é achado pelo convênio + início do texto (a planilha traz só o começo). Linha que não
casa com exatamente um item é listada e ignorada. Idempotente: não duplica a decisão vigente
igual. Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.importar_revisao_classificacao data/revisoes/revisao_codigos_RENEM_v2.xlsx
    python -m scripts.importar_revisao_classificacao ARQUIVO --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from collections import Counter

import openpyxl
from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.classificacao_itens import chave_do_item
from app.db.base import SessionLocal, engine
from app.db.models import Convenio, DecisaoClassificacaoItem
from app.pipeline.texto import normalizar_texto

_TIPOS = {
    "aquisição": "aquisicao",
    "complemento/rendimento": "rendimento_aplicacao",
    "multi-equipamento": "multiplo",
    "acessório/insumo": "acessorio_insumo",
}


def _linhas(caminho: str) -> list[dict]:
    ws = openpyxl.load_workbook(caminho, read_only=True, data_only=True)["Sem código – decisão"]
    linhas = list(ws.iter_rows(values_only=True))
    cab = [str(c or "").strip() for c in linhas[0]]
    return [dict(zip(cab, r)) for r in linhas[1:] if r and r[1]]


def _numero(v: object) -> float:
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return float("nan")


def _decisao_da_linha(linha: dict) -> tuple[str, str | None, bool | None, str]:
    tipo = _TIPOS.get(str(linha.get("Tipo de lançamento") or "").strip().lower())
    bruto = str(linha.get("Código RENEM indicado") or "").strip()
    codigo = bruto if bruto.isdigit() and len(bruto) == 6 else None
    aval = str(linha.get("Avaliação") or "").strip().upper()
    conta = {"S": True, "N": False}.get(str(linha.get("Conta unidade?") or "").strip().upper())
    pendente = tipo is None or aval == "VERIFICAR" or (tipo == "aquisicao" and codigo is None)
    return (tipo or "aquisicao"), codigo, conta, ("pendente" if pendente else "aplicada")


def importar(db: Session, caminho: str, *, aplicar: bool) -> Counter:
    cont: Counter = Counter()
    for linha in _linhas(caminho):
        numero = str(linha["Convênio"]).strip()
        inicio = normalizar_texto(str(linha["Texto (início)"] or ""))[:40]
        conv = db.scalar(select(Convenio).where(Convenio.numero == numero))
        itens = (conv.siconv_raw or {}).get("itens_plano_aplicacao", []) if conv else []
        achados = [
            i for i in itens if inicio and normalizar_texto(str(i.get("DESCRICAO_ITEM") or "")).startswith(inicio)
        ]
        if len(achados) > 1:
            # texto repetido no mesmo convênio: desempata pelo valor total da planilha
            alvo = _numero(linha.get("Valor total nominal (R$)"))
            achados = [i for i in achados if abs(_numero(i.get("VALOR_TOTAL_ITEM")) - alvo) < 0.01] or achados
        if len(achados) != 1:
            cont["sem_casamento_unico"] += 1
            print(f"  ignorada: convênio {numero}, '{inicio}' casou {len(achados)} itens")
            continue
        chave = chave_do_item(achados[0])
        tipo, codigo, conta, status = _decisao_da_linha(linha)
        vigente = db.scalar(
            select(DecisaoClassificacaoItem).where(
                DecisaoClassificacaoItem.convenio_numero == numero,
                DecisaoClassificacaoItem.chave_item == chave,
                DecisaoClassificacaoItem.substituida_por_id.is_(None),
            )
        )
        if vigente and (vigente.tipo_lancamento, vigente.codigo_item, vigente.status) == (tipo, codigo, status):
            cont["ja_igual"] += 1
            continue
        cont[f"nova_{status}"] += 1
        if not aplicar:
            continue
        nova = DecisaoClassificacaoItem(
            convenio_numero=numero,
            chave_item=chave,
            tipo_lancamento=tipo,
            codigo_item=codigo,
            conta_unidade=conta,
            origem="revisao_equipe",
            status=status,
            observacao=str(linha.get("Observação") or "") or None,
        )
        if vigente:
            # O índice único só admite uma vigente por item: entra com chave provisória,
            # aponta a antiga para ela e só então assume a chave real.
            nova.chave_item = chave + "#novo"
            db.add(nova)
            db.flush()
            vigente.substituida_por_id = nova.id
            db.flush()
            nova.chave_item = chave
        else:
            db.add(nova)
        db.flush()
    return cont


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("arquivo")
    ap.add_argument("--aplicar", action="store_true")
    ap.add_argument("--confirmo-host")
    args = ap.parse_args()
    host = make_url(str(engine.url)).host
    print(f"Banco: {host}")
    if args.aplicar and args.confirmo_host != host:
        raise SystemExit("Use --confirmo-host com o host exibido acima.")
    with SessionLocal() as db:
        cont = importar(db, args.arquivo, aplicar=args.aplicar)
        if args.aplicar:
            db.commit()
    print(dict(cont), "(aplicado)" if args.aplicar else "(simulação)")


if __name__ == "__main__":
    main()
