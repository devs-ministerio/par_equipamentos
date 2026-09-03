"""Monta a arvore relacional completa (proposta -> parceria -> execucao
financeira) da API de Gestao de Parcerias do TransfereGov pros convenentes
dos 71 convenios legados ja validados (scripts/validar_convenios.py) --
cruzamento por CNPJ (cnpj_ente_recebedor). Objetivo e "monitoramento de
equipamento": ver TUDO que a API oferece pra depois decidir o que filtrar,
nao uma analise de merito.

Por que por CNPJ e nao pelo numero do convenio: a API nova nao tem campo de
numero de convenio legado (ver app/pipeline/transferegov_parcerias.py) --
so da pra achar propostas/parcerias do MESMO ente que teve convenio antigo,
nao necessariamente a MESMA transacao.

Escopo (decisao deliberada, documentada aqui pra nao ficar implicita):
  - So expande (busca parceria/financeiro) propostas cujo `ds_objeto`
    contenha "EQUIPAMENTO" (case-insensitive) -- alguns CNPJs (fundo
    estadual de saude) tem centenas de propostas de todo tipo (obra,
    custeio, etc.), a maioria irrelevante pro escopo de equipamento.
  - Registra o TOTAL de propostas do CNPJ mesmo quando nao expande, pra
    deixar visivel na pagina que ha mais dado disponivel do que o que foi
    puxado (o usuario decide depois se quer afrouxar o filtro).
  - Financeiro executado (empenho/documento habil/ordem de pagamento) e
    buscado pra toda parceria encontrada -- e o dado mais "monitoravel"
    (indica se o dinheiro empenhado virou pagamento de fato).

Uso: python -m scripts.coletar_transferegov_relacional (de dentro de
backend/, venv ativo). Grava em scripts/output/transferegov_relacional.json.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from app.pipeline import transferegov_parcerias as tg

ENTRADA = Path(__file__).parent / "output" / "convenios_flat.json"
SAIDA = Path(__file__).parent / "output" / "transferegov_relacional.json"

FILTRO_OBJETO = re.compile(r"EQUIPAMENTO", re.IGNORECASE)


def run() -> None:
    convenios = json.loads(ENTRADA.read_text(encoding="utf-8"))
    cnpjs_por_convenente = {}
    for c in convenios:
        cnpj = re.sub(r"\D", "", c["convenente_cnpj"])
        cnpjs_por_convenente.setdefault(cnpj, {"nome": c["convenente_nome"], "convenios_legados": []})
        cnpjs_por_convenente[cnpj]["convenios_legados"].append(c["numero"])

    session = tg._sessao_com_retry()
    resultado = []

    for i, (cnpj, info) in enumerate(cnpjs_por_convenente.items(), 1):
        print(f"[{i}/{len(cnpjs_por_convenente)}] {info['nome']} (CNPJ {cnpj})...")
        total = tg.total_propostas_por_cnpj(session, cnpj)
        entrada_ente = {
            "cnpj": cnpj,
            "nome": info["nome"],
            "convenios_legados_relacionados": info["convenios_legados"],
            "total_propostas_na_api": total,
            "propostas_expandidas": [],
        }

        if total == 0:
            resultado.append(entrada_ente)
            continue

        propostas = tg.buscar_propostas_por_cnpj(session, cnpj)
        propostas_equipamento = [p for p in propostas if FILTRO_OBJETO.search(p.get("ds_objeto") or "")]
        print(f"   {total} proposta(s) total, {len(propostas_equipamento)} com 'EQUIPAMENTO' no objeto.")

        for p in propostas_equipamento:
            id_proposta = p["id_proposta"]
            bloco_proposta = {
                "proposta": p,
                "metas": tg.buscar_metas_por_proposta(session, id_proposta),
                "cronograma_desembolso": tg.buscar_cronograma_por_proposta(session, id_proposta),
                "distribuicao_recurso": tg.buscar_distribuicao_recurso_por_proposta(session, id_proposta),
                "analises": tg.buscar_analises_por_proposta(session, id_proposta),
                "parcerias": [],
            }

            # Etapa vem como LISTA aninhada em cada meta (`etapas_proposta`),
            # nao como campo flat -- confirmado inspecionando resposta real
            # (a nomenclatura `etapa_id_etapa_proposta` nos `parameters` do
            # openapi.json e so pro FILTRO de busca, a resposta em si aninha).
            # Item de despesa pendura em cada etapa.
            for meta in bloco_proposta["metas"]:
                for etapa in meta.get("etapas_proposta") or []:
                    etapa["itens"] = tg.buscar_itens_por_etapa(session, etapa["id_etapa_proposta"])

            for parceria in tg.buscar_parcerias_por_proposta(session, id_proposta):
                id_parceria = parceria["id_parceria"]
                bloco_proposta["parcerias"].append({
                    "parceria": parceria,
                    "empenhos": tg.buscar_empenhos_por_parceria(session, id_parceria),
                    "documentos_habeis": [
                        {**doc, "ordens_pagamento": tg.buscar_ordens_pagamento_por_documento(session, doc["id_documento_habil"])}
                        for doc in tg.buscar_documentos_habeis_por_parceria(session, id_parceria)
                    ],
                })

            entrada_ente["propostas_expandidas"].append(bloco_proposta)

        resultado.append(entrada_ente)

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")

    total_propostas_expandidas = sum(len(e["propostas_expandidas"]) for e in resultado)
    total_parcerias = sum(len(p["parcerias"]) for e in resultado for p in e["propostas_expandidas"])
    print(f"\nConcluido: {len(resultado)} entes, {total_propostas_expandidas} proposta(s) com "
          f"'EQUIPAMENTO' expandida(s), {total_parcerias} parceria(s) encontrada(s).")
    print(f"Gravado em {SAIDA}")


if __name__ == "__main__":
    run()
