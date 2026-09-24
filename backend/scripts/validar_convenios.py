"""Valida uma lista de numeros de convenio (legado SICONV) contra a API do
Portal da Transparencia -- ver app/pipeline/portal_transparencia.py pro
porque desse caminho em vez da API nova do TransfereGov.

Uso: python -m scripts.validar_convenios (de dentro de backend/, venv ativo,
com PORTAL_TRANSPARENCIA_API_KEY definida no .env)

Imprime um resumo (encontrados/nao encontrados/erros) e grava o detalhe em
scripts/output/convenios_validados.csv (recorte) e
scripts/output/convenios_completo.json (resposta crua da API, todos os
campos -- usado pela pagina de visualizacao em
docs/monitoramento-equipamentos/) pra conferencia manual.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from app.pipeline.portal_transparencia import ChaveApiAusenteError, validar_convenios

NUMEROS = [
    904824,
    925320,
    942625,
    942842,
    943884,
    943920,
    943969,
    946461,
    947256,
    947524,
    947527,
    948684,
    948685,
    948686,
    948687,
    948691,
    948692,
    948694,
    948695,
    948696,
    948698,
    949404,
    949415,
    949775,
    950114,
    950511,
    953401,
    953716,
    953718,
    953726,
    953739,
    953741,
    953743,
    953746,
    953749,
    953750,
    954006,
    954390,
    954391,
    954392,
    954398,
    954404,
    954413,
    954420,
    959453,
    961247,
    961305,
    962425,
    962431,
    968527,
    970343,
    970357,
    970364,
    970388,
    970392,
    970621,
    971131,
    971195,
    971355,
    971380,
    971398,
    971399,
    971549,
    973049,
    985640,
    985653,
    985655,
    988835,
    991708,
    991766,
    950115,
]

SAIDA = Path(__file__).parent / "output" / "convenios_validados.csv"


def run() -> None:
    print(f"Consultando {len(NUMEROS)} numero(s) de convenio no Portal da Transparencia...")
    try:
        resultados = validar_convenios(NUMEROS)
    except ChaveApiAusenteError as e:
        print(f"[ERRO] {e}")
        return

    encontrados = [r for r in resultados if r["encontrado"]]
    nao_encontrados = [r for r in resultados if not r["encontrado"] and not r["erro"]]
    com_erro = [r for r in resultados if r["erro"]]

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    with SAIDA.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "numero",
                "encontrado",
                "objeto",
                "situacao",
                "valor",
                "valor_liberado",
                "convenente",
                "municipio",
                "uf",
                "erro",
            ]
        )
        for r in resultados:
            dado = r["dado"] or {}
            convenente = dado.get("convenente") or {}
            municipio = dado.get("municipioConvenente") or {}
            # Campo `uf` da API vem com sigla/nome trocados (sigla="SÃO PAULO",
            # nome="SP") -- confirmado inspecionando resposta crua de 904824.
            uf = (municipio.get("uf") or {}).get("nome")
            writer.writerow(
                [
                    r["numero"],
                    r["encontrado"],
                    (dado.get("dimConvenio") or {}).get("objeto"),
                    dado.get("situacao"),
                    dado.get("valor"),
                    dado.get("valorLiberado"),
                    convenente.get("nome"),
                    municipio.get("nomeIBGE"),
                    uf,
                    r["erro"],
                ]
            )

    print(f"\nEncontrados: {len(encontrados)}/{len(NUMEROS)}")
    if nao_encontrados:
        print(f"NAO encontrados ({len(nao_encontrados)}): {', '.join(r['numero'] for r in nao_encontrados)}")
    if com_erro:
        print(f"Com erro de consulta ({len(com_erro)}): {', '.join(r['numero'] for r in com_erro)}")
    print(f"\nDetalhe (recorte) em {SAIDA}")

    saida_json = SAIDA.parent / "convenios_completo.json"
    saida_json.write_text(
        json.dumps([r["dado"] for r in resultados if r["dado"]], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Resposta crua (todos os campos) em {saida_json}")


if __name__ == "__main__":
    run()
