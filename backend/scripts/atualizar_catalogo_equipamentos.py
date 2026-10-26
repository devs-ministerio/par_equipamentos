"""Carrega a RENEM e atualiza o catálogo das 16 famílias com controle por unidade.

Faz, nesta ordem e só com ``--aplicar``:

1. grava os itens da RENEM (`renem_item`) da versão informada, sem apagar versões anteriores;
2. garante uma linha de catálogo para cada família (cria as que faltam; nas existentes só
   liga `controle_por_unidade`, `prioritario` e `nome_oficial`, sem renomear nada);
3. liga cada item da RENEM da família ao catálogo;
4. grava os códigos legados (`codigo_item_legado`), inclusive o 012005, que não consta da
   lista de março de 2026.

Idempotente. Sem ``--aplicar`` só informa o que mudaria. Uma linha de auditoria por execução.

Uso:
    python -m scripts.atualizar_catalogo_equipamentos
    python -m scripts.atualizar_catalogo_equipamentos --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import CodigoItemLegado, EquipamentoCatalogo, RenemItem
from app.equipamentos_renem import FAMILIAS, normalizar_codigo
from app.pipeline.texto import parsear_valor_brasileiro

ARQUIVO_PADRAO = Path(__file__).resolve().parents[2] / "data" / "raw" / "Lista.Renem_.Site_.FNS_030326-1.xlsx"
VERSAO_PADRAO = "2026-03-03"


@dataclass
class Resultado:
    renem_novos: int = 0
    renem_atualizados: int = 0
    catalogo_criados: list[str] = field(default_factory=list)
    catalogo_atualizados: list[str] = field(default_factory=list)
    catalogo_adotados: list[str] = field(default_factory=list)
    renem_ligados: int = 0
    legados_novos: int = 0
    codigos_da_familia_ausentes_da_renem: list[str] = field(default_factory=list)


def ler_renem(caminho: Path) -> list[dict]:
    planilha = load_workbook(caminho, read_only=True, data_only=True).active
    itens: list[dict] = []
    for indice, linha in enumerate(planilha.iter_rows(values_only=True)):
        if indice < 2 or not linha or linha[0] is None:
            continue
        codigo = normalizar_codigo(str(linha[0]).split(".")[0])
        itens.append(
            {
                "codigo_item": codigo,
                "nome": str(linha[1]).strip(),
                "definicao": (str(linha[2]).strip() if linha[2] else None),
                "classificacao": (str(linha[3]).strip() if linha[3] else None),
                "valor_sugerido": parsear_valor_brasileiro(linha[4]) if linha[4] is not None else None,
                "item_dolarizado": (str(linha[5]).strip().upper() == "S") if linha[5] else None,
            }
        )
    return itens


def _igual(atual: object, novo: object) -> bool:
    """Compara valores da planilha com os do banco (Numeric volta como Decimal, com 4 casas)."""
    if isinstance(atual, (int, float, Decimal)) and isinstance(novo, (int, float, Decimal)):
        return round(float(atual), 4) == round(float(novo), 4)
    return atual == novo


def atualizar(db: Session, itens: list[dict], versao: str) -> Resultado:
    resultado = Resultado()
    existentes = {
        i.codigo_item: i for i in db.execute(select(RenemItem).where(RenemItem.versao_lista == versao)).scalars()
    }
    for dados in itens:
        atual = existentes.get(dados["codigo_item"])
        if atual is None:
            db.add(RenemItem(versao_lista=versao, **dados))
            resultado.renem_novos += 1
            continue
        if any(not _igual(getattr(atual, k), v) for k, v in dados.items()):
            for chave, valor in dados.items():
                setattr(atual, chave, valor)
            resultado.renem_atualizados += 1
    db.flush()

    catalogo = {c.codigo: c for c in db.execute(select(EquipamentoCatalogo)).scalars()}
    nomes_usados = {c.nome for c in catalogo.values()}
    for familia in FAMILIAS:
        linha = catalogo.get(familia.catalogo_codigo)
        if linha is None:
            nome = familia.nome_catalogo or familia.nome_oficial
            existente = next((c for c in catalogo.values() if c.nome == nome), None)
            if existente is not None:
                # Linha gerada automaticamente para o mesmo nome: adota (mantém id e marcadores).
                if not existente.codigo.startswith("item_plano_"):
                    raise ValueError(f"O nome '{nome}' já existe no catálogo com o código '{existente.codigo}'.")
                catalogo.pop(existente.codigo)
                existente.codigo = familia.catalogo_codigo
                existente.prioritario = True
                existente.controle_por_unidade = True
                existente.nome_oficial = familia.nome_oficial
                catalogo[familia.catalogo_codigo] = existente
                resultado.catalogo_adotados.append(familia.catalogo_codigo)
                continue
            linha = EquipamentoCatalogo(
                codigo=familia.catalogo_codigo,
                nome=nome,
                prioritario=True,
                controle_por_unidade=True,
                nome_oficial=familia.nome_oficial,
            )
            db.add(linha)
            catalogo[familia.catalogo_codigo] = linha
            nomes_usados.add(nome)
            resultado.catalogo_criados.append(familia.catalogo_codigo)
        elif not (linha.prioritario and linha.controle_por_unidade and linha.nome_oficial == familia.nome_oficial):
            linha.prioritario = True
            linha.controle_por_unidade = True
            linha.nome_oficial = familia.nome_oficial
            resultado.catalogo_atualizados.append(familia.catalogo_codigo)
    db.flush()

    por_codigo = {
        i.codigo_item: i for i in db.execute(select(RenemItem).where(RenemItem.versao_lista == versao)).scalars()
    }
    for familia in FAMILIAS:
        alvo = catalogo[familia.catalogo_codigo]
        for codigo in familia.renem:
            item = por_codigo.get(codigo)
            if item is None:
                resultado.codigos_da_familia_ausentes_da_renem.append(codigo)
            elif item.catalogo_id != alvo.id:
                item.catalogo_id = alvo.id
                resultado.renem_ligados += 1
        ja = {c.codigo_item for c in db.execute(select(CodigoItemLegado)).scalars()}
        for legado in familia.legados:
            if legado.codigo not in ja:
                db.add(
                    CodigoItemLegado(
                        codigo_item=legado.codigo, nome=legado.nome, catalogo_id=alvo.id, origem=legado.origem
                    )
                )
                resultado.legados_novos += 1
    db.flush()
    return resultado


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--arquivo", type=Path, default=ARQUIVO_PADRAO)
    analisador.add_argument("--versao", default=VERSAO_PADRAO, help="data da lista RENEM (AAAA-MM-DD)")
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)
    date.fromisoformat(args.versao)

    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    itens = ler_renem(args.arquivo)
    with SessionLocal() as db:
        resultado = atualizar(db, itens, args.versao)
        if args.aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="equipamento_catalogo",
                entity_id=0,
                action="atualizar_catalogo_renem",
                details={
                    "versao_lista": args.versao,
                    "itens_renem": len(itens),
                    "catalogo_criados": resultado.catalogo_criados,
                    "catalogo_atualizados": resultado.catalogo_atualizados,
                    "catalogo_adotados": resultado.catalogo_adotados,
                },
            )
            db.commit()
        else:
            db.rollback()
    modo = "gravado" if args.aplicar else "a gravar (simulação, nada foi alterado)"
    print(f"RENEM {args.versao} ({len(itens)} itens) {modo}:")
    print(f"  itens novos: {resultado.renem_novos}, atualizados: {resultado.renem_atualizados}")
    print(f"  catálogo criados ({len(resultado.catalogo_criados)}): {', '.join(resultado.catalogo_criados) or '-'}")
    print(f"  catálogo adotados (linha automática do mesmo nome): {', '.join(resultado.catalogo_adotados) or '-'}")
    print(
        f"  catálogo atualizados ({len(resultado.catalogo_atualizados)}): "
        f"{', '.join(resultado.catalogo_atualizados) or '-'}"
    )
    print(f"  itens da RENEM ligados a famílias: {resultado.renem_ligados}")
    print(f"  códigos legados novos: {resultado.legados_novos}")
    if resultado.codigos_da_familia_ausentes_da_renem:
        print(f"  ATENÇÃO, códigos de família ausentes desta RENEM: {resultado.codigos_da_familia_ausentes_da_renem}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
