"""Importa data/raw/POPULACAO_CNC(POPULACAO).csv pra municipality_population_row
-- fonte de POPULACAO_ANS (beneficiarios de plano de saude por municipio),
que nao tem API oficial ao vivo conhecida (population_residente continua
vindo ao vivo do SIDRA/IBGE em api_sidra.py; e so a parcela ANS que vem
deste arquivo).

O arquivo guarda tambem POPULACAO_RESIDENTE e POPULACAO_SUS_DEPENDENTE
proprios (calculados no momento em que alguem gerou o CSV) -- importamos
os 3 pra MunicipalityPopulationRow por proveniencia/auditoria, mas o
pipeline (run_pipeline_tomografo.py) SO usa a coluna ans_population daqui;
o residente fica com o SIDRA ao vivo e o sus_dependente e recalculado
(residente_ao_vivo - ans_deste_arquivo), pra nao misturar o IBGE "congelado"
do CSV com o IBGE ao vivo que ja usavamos.

O arquivo tem ~1 milhao de linhas no disco, mas so as primeiras ~5570 tem
dado real -- o resto e padding vazio de exportacao do Excel (2^20 linhas),
descartado pela checagem de IBGE_MUNICIPIO numerico abaixo.

Uso: python -m scripts.importar_populacao_municipios [caminho_do_csv]
     (de dentro de backend/, com venv ativo)
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

from app.db.base import SessionLocal
from app.db.models import MunicipalityPopulationRow, ReferenceFile, ReferenceFileType

CAMINHO_PADRAO = Path(__file__).resolve().parents[2] / "data" / "raw" / "POPULACAO_CNC(POPULAÇÃO).csv"


def _int_ou_zero(valor: str) -> int:
    valor = (valor or "").strip()
    return int(valor) if valor.isdigit() else 0


def _ler_linhas(caminho: Path) -> list[dict[str, int | str]]:
    linhas = []
    with caminho.open(encoding="ISO-8859-1", newline="") as f:
        leitor = csv.DictReader(f, delimiter=";")
        for r in leitor:
            ibge = (r.get("IBGE_MUNICIPIO") or "").strip()
            if not ibge.isdigit():
                continue  # descarta padding vazio (linhas ";;;;;;;;;" do Excel)
            linhas.append(
                {
                    "ibge_code": ibge,
                    "resident_population": _int_ou_zero(r.get("POPULACAO_RESIDENTE", "")),
                    "ans_population": _int_ou_zero(r.get("POPULACAO_ANS", "")),
                    "sus_dependent_population": _int_ou_zero(r.get("POPULACAO_SUS_DEPENDENTE", "")),
                }
            )
    return linhas


def importar(caminho: Path = CAMINHO_PADRAO) -> None:
    print(f"Lendo {caminho.name}...")
    linhas = _ler_linhas(caminho)
    print(f"   {len(linhas)} municipios com dado real (padding vazio descartado).")

    db = SessionLocal()
    try:
        # so um arquivo de populacao ativo por vez -- desativa os anteriores
        # em vez de apagar (mantem historico de qual CSV valia em cada
        # execucao do pipeline que rodou com ele).
        anteriores = (
            db.query(ReferenceFile)
            .filter(ReferenceFile.type == ReferenceFileType.population, ReferenceFile.active.is_(True))
            .all()
        )
        for rf in anteriores:
            rf.active = False

        reference_file = ReferenceFile(
            type=ReferenceFileType.population,
            original_file=caminho.name,
            active=True,
        )
        db.add(reference_file)
        db.flush()

        db.add_all(MunicipalityPopulationRow(reference_file_id=reference_file.id, **linha) for linha in linhas)
        db.commit()
        print(f"Concluido -- reference_file={reference_file.id}, {len(linhas)} municipios importados.")
        if anteriores:
            print(f"   Arquivo(s) de populacao anterior(es) desativado(s): {[rf.id for rf in anteriores]}")
    finally:
        db.close()


if __name__ == "__main__":
    caminho = Path(sys.argv[1]) if len(sys.argv) > 1 else CAMINHO_PADRAO
    importar(caminho)
