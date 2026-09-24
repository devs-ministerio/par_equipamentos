"""Valida os pisos constitucionais por camada a partir do JSON do coverage."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

CAMADAS: dict[str, tuple[str, float]] = {
    "services": ("/app/services/", 80.0),
    "repositories": ("/app/repositories/", 70.0),
    "routes": ("/app/routers/", 60.0),
}


def _percentual(coberto: int, total: int) -> float:
    return 100.0 if total == 0 else coberto / total * 100


def avaliar_cobertura(dados: dict[str, Any]) -> list[str]:
    """Retorna violações de linha ou branch, uma por camada abaixo do piso."""
    violacoes: list[str] = []
    arquivos = dados.get("files", {})
    for nome, (marcador, piso) in CAMADAS.items():
        resumos = [
            arquivo["summary"]
            for caminho, arquivo in arquivos.items()
            if marcador.lstrip("/") in caminho.replace("\\", "/")
        ]
        if not resumos:
            violacoes.append(f"{nome}: nenhum arquivo encontrado para validar")
            continue
        linhas_cobertas = sum(resumo["covered_lines"] for resumo in resumos)
        linhas_total = sum(resumo["num_statements"] for resumo in resumos)
        branches_cobertos = sum(resumo["covered_branches"] for resumo in resumos)
        branches_total = sum(resumo["num_branches"] for resumo in resumos)
        linhas = _percentual(linhas_cobertas, linhas_total)
        branches = _percentual(branches_cobertos, branches_total)
        print(f"{nome}: linhas={linhas:.1f}% branches={branches:.1f}% piso={piso:.1f}%")
        if linhas < piso or branches < piso:
            violacoes.append(f"{nome}: linhas={linhas:.1f}% branches={branches:.1f}% abaixo de {piso:.1f}%")
    return violacoes


def main(argv: list[str] | None = None) -> int:
    argumentos = argv or sys.argv[1:]
    if len(argumentos) != 1:
        print("Uso: python -m scripts.validar_cobertura <coverage.json>", file=sys.stderr)
        return 2
    dados = json.loads(Path(argumentos[0]).read_text(encoding="utf-8"))
    violacoes = avaliar_cobertura(dados)
    if not violacoes:
        return 0
    print("Cobertura insuficiente:", *violacoes, sep="\n- ", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
