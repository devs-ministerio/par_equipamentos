"""Carrega a base aberta da ANSN e os vínculos validados (CNES x matrícula) da licença de operação.

- `--instalacoes`: JSON da ANSN (`{"metadados": {...}, "instalacoes": [...]}`), com matrícula, designação, cidade, UF,
  área, situação (`valida`/`suspensa`) e validade.
- `--vinculos`: CSV ou XLSX já validado pela equipe, com colunas `CNES` e `Matrícula` (ou `Matrícula ANSN`).
- Idempotente. Sem `--aplicar` apenas simula. Matrícula ausente da carga nova não é alterada nem dada como vencida.

Uso:
    python -m scripts.importar_licencas_ansn --instalacoes ansn.json --vinculos vinculos.xlsx
    python -m scripts.importar_licencas_ansn --instalacoes ansn.json --vinculos vinculos.xlsx --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
import csv
import json
import unicodedata
from datetime import date
from pathlib import Path

from sqlalchemy.engine import make_url

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.services.carga_licencas_ansn import importar_instalacoes, importar_vinculos


def _chave(texto: object) -> str:
    base = unicodedata.normalize("NFD", str(texto or "")).encode("ascii", "ignore").decode()
    return " ".join(base.lower().split())


def ler_vinculos(caminho: Path) -> list[tuple[str, str]]:
    """Lê CNES e matrícula de um CSV (`,` ou `;`) ou XLSX (primeira aba que tiver as duas colunas)."""
    if caminho.suffix.lower() == ".xlsx":
        from openpyxl import load_workbook

        tabelas = [
            [list(linha) for linha in aba.iter_rows(values_only=True)]
            for aba in load_workbook(caminho, read_only=True, data_only=True).worksheets
        ]
    else:
        with caminho.open(encoding="utf-8-sig", newline="") as f:
            amostra = f.read(2048)
            f.seek(0)
            delimitador = ";" if amostra.count(";") > amostra.count(",") else ","
            tabelas = [[list(linha) for linha in csv.reader(f, delimiter=delimitador)]]
    for tabela in tabelas:
        if not tabela:
            continue
        cabecalho = [_chave(c) for c in tabela[0]]
        if "cnes" not in cabecalho:
            continue
        coluna_matricula = next((i for i, c in enumerate(cabecalho) if c in ("matricula", "matricula ansn")), None)
        if coluna_matricula is None:
            continue
        i_cnes = cabecalho.index("cnes")
        return [
            (str(linha[i_cnes]), str(linha[coluna_matricula]))
            for linha in tabela[1:]
            if len(linha) > max(i_cnes, coluna_matricula) and linha[i_cnes] and linha[coluna_matricula]
        ]
    raise SystemExit("Nenhuma tabela com as colunas CNES e Matrícula.")


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--instalacoes", type=Path, required=True, help="JSON da ANSN")
    analisador.add_argument("--vinculos", type=Path, help="CSV/XLSX com CNES e Matrícula, já validado")
    analisador.add_argument("--consultado-em", help="AAAA-MM-DD; padrão: metadados.consultado_em do JSON")
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)

    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    dados = json.loads(args.instalacoes.read_text(encoding="utf-8"))
    consultado = date.fromisoformat(args.consultado_em or dados["metadados"]["consultado_em"])
    vinculos = ler_vinculos(args.vinculos) if args.vinculos else []
    with SessionLocal() as db:
        instalacoes = importar_instalacoes(db, dados["instalacoes"], consultado, aplicar=args.aplicar)
        resultado_vinculos, rejeitadas = importar_vinculos(db, vinculos, aplicar=args.aplicar)
        if args.aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="instalacao_ansn",
                entity_id=0,
                action="importar_licencas_ansn",
                details={
                    "consultado_em": consultado.isoformat(),
                    "instalacoes": dict(instalacoes),
                    "vinculos": dict(resultado_vinculos),
                },
            )
            db.commit()
        else:
            db.rollback()
    print("Gravado." if args.aplicar else "Simulação: nada foi alterado.")
    print(f"Instalações (consulta de {consultado:%d/%m/%Y}):")
    for rotulo, n in sorted(instalacoes.items()):
        print(f"  {rotulo}: {n}")
    print("Vínculos:")
    for rotulo, n in sorted(resultado_vinculos.items()):
        print(f"  {rotulo}: {n}")
    for linha in rejeitadas:
        print(f"  ! {linha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
