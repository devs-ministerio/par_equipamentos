"""Relatorio de drift entre app/db/models.py, migrations e (best-effort)
docs/database/modelo_er.mermaid.

Item 4 do Plan Mode database 2026-09-16
(docs/arquitetura/planmode-database-2026-09-16.md): "relatorio, nao gate" --
por padrao sempre sai com codigo 0, so imprime o que encontrou. A mesma
logica de comparacao ja e o GATE de `tests/test_schema_migrations.py`
(pytest -m db); este script reaproveita as mesmas funcoes
(`scripts.schema_drift`) pra rodar fora do pytest, sem depender de banco
com TEST_DATABASE_URL nem duplicar a comparacao.

Uso:

    python -m scripts.auditar_drift_schema
    python -m scripts.auditar_drift_schema --strict   # sai com codigo 1 se houver diff real

O bloco do `.mermaid` e sempre informativo, mesmo em --strict -- o proprio
arquivo declara que a fonte da verdade e app/db/models.py, nao ele.
"""
from __future__ import annotations

import argparse
import sys

from app.db import models  # noqa: F401 -- registra os modelos em Base.metadata
from app.db.base import Base, engine
from scripts.schema_drift import BACKEND_DIR, comparar_heads, diff_metadata_vs_banco, tabelas_do_mermaid

MERMAID_PATH = BACKEND_DIR.parent / "docs" / "database" / "modelo_er.mermaid"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--strict", action="store_true",
        help="sai com codigo 1 se houver diff real de metadata/head (nunca por causa do .mermaid)",
    )
    args = parser.parse_args()

    houve_diff_real = False

    diffs = diff_metadata_vs_banco(engine, Base.metadata)
    if diffs:
        houve_diff_real = True
        print(f"[DRIFT] app/db/models.py diverge do schema aplicado no banco ({len(diffs)} diferenca(s)):")
        for diff in diffs:
            print(f"  - {diff}")
    else:
        print("[OK] app/db/models.py bate com o schema aplicado no banco.")

    head_do_banco, head_dos_arquivos = comparar_heads(engine)
    if head_do_banco != head_dos_arquivos:
        houve_diff_real = True
        print(f"[DRIFT] banco esta em {head_do_banco!r}, head dos arquivos e {head_dos_arquivos!r}.")
    else:
        print(f"[OK] banco no head dos arquivos de migration ({head_do_banco!r}).")

    if MERMAID_PATH.exists():
        tabelas_mermaid = tabelas_do_mermaid(MERMAID_PATH)
        tabelas_metadata = set(Base.metadata.tables.keys())
        so_no_mermaid = sorted(tabelas_mermaid - tabelas_metadata)
        so_no_metadata = sorted(tabelas_metadata - tabelas_mermaid)
        if so_no_mermaid or so_no_metadata:
            print("[INFO] docs/database/modelo_er.mermaid pode estar desatualizado (informativo, nunca falha o build):")
            if so_no_mermaid:
                print(f"  - so no .mermaid: {so_no_mermaid}")
            if so_no_metadata:
                print(f"  - so em app/db/models.py: {so_no_metadata}")
        else:
            print("[OK] tabelas de docs/database/modelo_er.mermaid batem com app/db/models.py.")
    else:
        print(f"[INFO] {MERMAID_PATH} nao encontrado -- pulando comparacao com o .mermaid.")

    if args.strict and houve_diff_real:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
