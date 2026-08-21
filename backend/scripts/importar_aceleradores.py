"""Importa data/raw/aceleradores_levantamento.xlsx pra accelerator_row --
levantamento manual real de Acelerador Linear (221 estabelecimentos, coluna
EM_OPERACAO como fonte de verdade -- pode ser menor que o autorizado em
portaria/monitorado). Sem API oficial ao vivo conhecida pra esse inventario
(diferente de TOMOGRAFO/RESSONANCIA, que vem ao vivo do ElastiCNES) --
arquivo de referencia versionado, igual ao de populacao ANS.

Ver docs/design/decan-equipamentos-contexto.md secao 9.2 pra proveniencia
do arquivo (Gustavo trouxe em 2026-08-05/06).

Uso: python -m scripts.importar_aceleradores [caminho_do_xlsx]
     (de dentro de backend/, com venv ativo -- precisa de `uv add fastexcel`
     pro polars conseguir ler .xlsx)
"""
from __future__ import annotations

import sys
from pathlib import Path

import polars as pl

from app.db.base import SessionLocal
from app.db.models import AcceleratorRow, ReferenceFile, ReferenceFileType

CAMINHO_PADRAO = Path(__file__).resolve().parents[2] / "data" / "raw" / "aceleradores_levantamento.xlsx"


def _ler_linhas(caminho: Path) -> list[dict[str, str | int]]:
    df = pl.read_excel(caminho)
    linhas = []
    descartadas = 0
    for row in df.iter_rows(named=True):
        # 1 linha do arquivo (CNES 2273748) nao tem estabelecimento/UF/
        # municipio/IBGE -- nao da pra localizar geograficamente, descarta
        # (RN-06 do resto do pipeline: nunca inventa dado geografico).
        if row["ESTABELECIMENTO"] is None or row["IBGE"] is None or row["UF"] is None:
            descartadas += 1
            continue
        linhas.append(
            {
                "cnes_code": str(row["CNES"]),
                "facility_name": row["ESTABELECIMENTO"],
                "state": row["UF"],
                "ibge_code": str(row["IBGE"]),
                "operational_qty": int(row["EM_OPERACAO"] or 0),
            }
        )
    if descartadas:
        print(f"   [AVISO] {descartadas} linha(s) sem geolocalizacao descartada(s).")
    return linhas


def importar(caminho: Path = CAMINHO_PADRAO) -> None:
    print(f"Lendo {caminho.name}...")
    linhas = _ler_linhas(caminho)
    print(f"   {len(linhas)} estabelecimentos com dado real.")

    db = SessionLocal()
    try:
        # so um arquivo de acelerador ativo por vez -- mesmo padrao do
        # importador de populacao (desativa em vez de apagar, mantem
        # historico de qual arquivo valia em cada execucao).
        anteriores = db.query(ReferenceFile).filter(
            ReferenceFile.type == ReferenceFileType.accelerator, ReferenceFile.active.is_(True)
        ).all()
        for rf in anteriores:
            rf.active = False

        reference_file = ReferenceFile(
            type=ReferenceFileType.accelerator,
            original_file=caminho.name,
            active=True,
        )
        db.add(reference_file)
        db.flush()

        db.add_all(AcceleratorRow(reference_file_id=reference_file.id, **linha) for linha in linhas)
        db.commit()
        print(f"Concluido -- reference_file={reference_file.id}, {len(linhas)} estabelecimentos importados.")
        if anteriores:
            print(f"   Arquivo(s) de acelerador anterior(es) desativado(s): {[rf.id for rf in anteriores]}")
    finally:
        db.close()


if __name__ == "__main__":
    caminho = Path(sys.argv[1]) if len(sys.argv) > 1 else CAMINHO_PADRAO
    importar(caminho)
