"""Diagnóstico somente leitura de novos convênios a partir de snapshots locais.

Não baixa ZIP, não cria carteira/Radar, não gera avisos e não grava captura.
O resultado usa o snapshot fornecido e NÃO comprova atualização da fonte.
"""

import argparse
import json
from pathlib import Path

from app.db.base import SessionLocal
from app.pipeline.portal_transparencia import _headers, _sessao_com_retry, buscar_convenio_por_numero_dto
from app.repositories.descoberta_legado import ler_snapshot_csv, numeros_legados_conhecidos
from app.services.descoberta_legado import confirmar_no_portal, descobrir_legado


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--convenios-zip", type=Path, required=True)
    parser.add_argument("--itens-zip", type=Path, required=True)
    parser.add_argument(
        "--confirmar-portal", action="store_true", help="Consulta externa somente leitura; exige chave via ambiente"
    )
    parser.add_argument("--limite", type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.limite <= 1000:
        parser.error("O limite deve estar entre 1 e 1000.")
    if args.confirmar_portal:
        _headers()  # falhar antes de ler o snapshot nacional se faltar chave
    with SessionLocal() as db:
        conhecidos = numeros_legados_conhecidos(db)
    candidatos = descobrir_legado(
        ler_snapshot_csv(args.convenios_zip, colunas={"ID_PROPOSTA", "NR_CONVENIO"}),
        ler_snapshot_csv(args.itens_zip, colunas={"ID_PROPOSTA", "ID_ITEM_PAD", "DESCRICAO_ITEM"}),
        conhecidos=conhecidos,
    )
    selecionados = candidatos[: args.limite]
    if args.confirmar_portal:
        with _sessao_com_retry() as sessao:
            selecionados = [
                confirmar_no_portal(c, buscar_convenio_por_numero_dto(c.numero, session=sessao)) for c in selecionados
            ]
    print(
        json.dumps(
            {
                "somente_leitura": True,
                "origem": "snapshots locais; frescor não confirmado",
                "total_candidatos": len(candidatos),
                "nao_processados": len(candidatos) - len(selecionados),
                "candidatos": [c.model_dump(mode="json") for c in selecionados],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
