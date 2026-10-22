"""Leitura dos números conhecidos e dos snapshots ZIP nacionais do SICONV."""

import csv
import io
from collections.abc import Iterator
from pathlib import Path
from zipfile import ZipFile

from sqlalchemy import select, union
from sqlalchemy.orm import Session

from app.db.models import Convenio, InstrumentoEquipamento


def numeros_legados_conhecidos(db: Session) -> set[str]:
    consulta = union(
        select(Convenio.numero).where(
            Convenio.tipo_contratacao.in_(["Convênio", "Convenio"]) | Convenio.tipo_contratacao.is_(None)
        ),
        select(InstrumentoEquipamento.nr_convenio).where(
            InstrumentoEquipamento.tipo_contratacao.in_(["Convênio", "Convenio"])
        ),
    )
    return set(db.scalars(consulta))


def ler_snapshot_csv(caminho: Path, *, colunas: set[str]) -> Iterator[dict[str, str]]:
    # Nunca extrair arquivo para disco ou materializar o CSV nacional inteiro.
    with ZipFile(caminho) as arquivo:
        membros = [nome for nome in arquivo.namelist() if not nome.endswith("/")]
        if len(membros) != 1 or not membros[0].lower().endswith(".csv"):
            raise ValueError("Snapshot SICONV deve conter exatamente um CSV.")
        with arquivo.open(membros[0]) as binario, io.TextIOWrapper(binario, encoding="utf-8-sig", newline="") as texto:
            leitor = csv.reader(texto, delimiter=";", strict=True)
            cabecalho = next(leitor, [])
            if not colunas <= set(cabecalho) or len(set(cabecalho)) != len(cabecalho):
                raise ValueError("Cabeçalho SICONV ausente, incompleto ou duplicado.")
            for linha in leitor:
                if len(linha) != len(cabecalho):
                    raise ValueError("Snapshot SICONV contém linha truncada ou ambígua; diagnóstico abortado.")
                yield dict(zip(cabecalho, linha, strict=True))
