"""Importa a coluna CNC_ESTIMADO_INCA de
data/raw/POPULACAO_CNC(POPULAÇÃO).csv pra inca_estimate -- casos novos de
cancer estimados pelo INCA, agregados por UF (RN validada com a equipe do
DECAN pro Acelerador Linear: "1 acelerador / 1.000 casos novos/ano", ver
docs/design/decan-equipamentos-contexto.md secao 9.2 e 4).

Mesmo arquivo ja usado por importar_populacao_municipios.py (POPULACAO_ANS),
so que aqui a coluna de interesse e outra (CNC_ESTIMADO_INCA, valor
decimal por municipio -- ja fracionado/proporcionalizado pelo INCA, nao um
inteiro). Nao tem FK pra reference_file (IncaEstimate nao guarda
proveniencia de arquivo no schema atual); controla versao so pelo `active`
-- desativa as estimativas do mesmo nivel/trienio antes de gravar as novas.

Uso: python -m scripts.importar_inca_estimates [caminho_do_csv] [trienio]
     (de dentro de backend/, com venv ativo)
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

from app.db.base import SessionLocal
from app.db.models import IncaEstimate, IncaEstimateLevel
from app.pipeline.api_demas import sigla_uf

CAMINHO_PADRAO = Path(__file__).resolve().parents[2] / "data" / "raw" / "POPULACAO_CNC(POPULAÇÃO).csv"
# Trienio da estimativa em vigor no arquivo (INCA 2026-2028, divulgada
# 04/02/2026 -- ver docs/design/decan-equipamentos-contexto.md secao 4).
TRIENIO_PADRAO = "2026-2028"


def _float_ou_zero(valor: str) -> float:
    valor = (valor or "").strip().replace(",", ".")
    try:
        return float(valor) if valor else 0.0
    except ValueError:
        return 0.0


def _agregar_por_uf(caminho: Path) -> dict[str, float]:
    por_uf: dict[str, float] = {}
    with caminho.open(encoding="ISO-8859-1", newline="") as f:
        leitor = csv.DictReader(f, delimiter=";")
        for r in leitor:
            ibge = (r.get("IBGE_MUNICIPIO") or "").strip()
            if not ibge.isdigit():
                continue  # descarta padding vazio (linhas ";;;;;;;;;" do Excel)
            uf = sigla_uf(r.get("Estado", ""))
            casos = _float_ou_zero(r.get("CNC_ESTIMADO_INCA", ""))
            por_uf[uf] = por_uf.get(uf, 0.0) + casos
    return por_uf


def importar(caminho: Path = CAMINHO_PADRAO, trienio: str = TRIENIO_PADRAO) -> None:
    print(f"Lendo {caminho.name}...")
    por_uf = _agregar_por_uf(caminho)
    print(f"   {len(por_uf)} UFs, {round(sum(por_uf.values()))} casos novos/ano estimados no total.")

    db = SessionLocal()
    try:
        anteriores = db.query(IncaEstimate).filter(
            IncaEstimate.level == IncaEstimateLevel.uf, IncaEstimate.active.is_(True)
        ).all()
        for estimativa in anteriores:
            estimativa.active = False

        db.add_all(
            IncaEstimate(
                level=IncaEstimateLevel.uf,
                uf=uf,
                estimated_cases=round(casos),
                triennium=trienio,
                active=True,
            )
            for uf, casos in por_uf.items()
        )
        db.commit()
        print(f"Concluido -- {len(por_uf)} UFs importadas pro trienio {trienio}.")
        if anteriores:
            print(f"   {len(anteriores)} estimativa(s) de UF anterior(es) desativada(s).")
    finally:
        db.close()


if __name__ == "__main__":
    caminho = Path(sys.argv[1]) if len(sys.argv) > 1 else CAMINHO_PADRAO
    trienio = sys.argv[2] if len(sys.argv) > 2 else TRIENIO_PADRAO
    importar(caminho, trienio)
