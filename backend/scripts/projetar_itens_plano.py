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

from sqlalchemy.engine import make_url

from app.audit import log_action
from app.classificacao_itens import limite_valor_unitario_monitorado
from app.db.base import SessionLocal, engine
from app.services.projecao_itens_plano import (  # noqa: F401  (reexportados: testes e uso por módulo)
    Alvo,
    Contexto,
    Resultado,
    _aplicar_excecao_instrumento,
    ajustar_por_natureza_siconv,
    alvo_item_api,
    alvo_item_manual,
    carregar_contexto,
    projetar,
    resolver_principais,
    valor_unitario,
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
    print(f"  por tipo de lançamento: {dict(r.por_tipo)}; a revisar: {r.pendentes}")
    print(
        f"  rendimento ligado ao principal: {r.rendimentos_ligados}; sem principal único: {r.rendimentos_sem_principal}"
    )
    print(f"  manuais por fonte do código: {dict(r.manual_por_codigo_fonte)}")
    print(
        f"  exceção de instrumento sem item controlado: {r.instrumentos_excecao} instrumentos, {r.por_excecao_instrumento} itens\n"
        f"  controlados por valor (unidade a partir de R$ {int(limite_valor_unitario_monitorado()) // 1000} mil): {r.por_valor}"
    )
    print("  controlados por unidade, por família:")
    for familia, n in r.por_familia.most_common():
        print(f"    {familia}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
