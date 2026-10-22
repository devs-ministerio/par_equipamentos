"""Arquiva e remove somente cinco bases antigas explicitamente inventariadas.

Não encerra conexões, não toca no banco ativo do app nem aceita destinos remotos.
Os dumps privados permitem restauração posterior com pg_restore.
"""

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

import psycopg
from psycopg import sql

ALVOS = (
    (5432, "gustavoleite", "sigeo_constitution_test"),
    (5432, "gustavoleite", "sigeo_e2e_local"),
    (5432, "gustavoleite", "sigeo_homologacao_local"),
    (55433, "postgres", "sigeo_test"),
    (55433, "postgres", "sigeo_test_integracao_master_20261006"),
)


def limpar(diretorio: Path) -> list[dict[str, str | int]]:
    diretorio.mkdir(mode=0o700, parents=True, exist_ok=False)
    resultados: list[dict[str, str | int]] = []
    for porta, usuario, nome in ALVOS:
        with psycopg.connect(host="127.0.0.1", port=porta, user=usuario, dbname="postgres", autocommit=True) as admin:
            existe = admin.execute("SELECT datallowconn FROM pg_database WHERE datname=%s", (nome,)).fetchone()
            if existe is None:
                resultados.append({"banco": nome, "porta": porta, "resultado": "já ausente"})
                continue
            ativos = admin.execute("SELECT 1 FROM pg_stat_activity WHERE datname=%s", (nome,)).fetchone()
            if ativos:
                resultados.append({"banco": nome, "porta": porta, "resultado": "preservado: em uso"})
                continue
            dump = diretorio / f"{porta}-{nome}.dump"
            env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
            env.update(PGHOST="127.0.0.1", PGPORT=str(porta), PGUSER=usuario, PGDATABASE=nome)
            with os.fdopen(os.open(dump, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as arquivo:
                subprocess.run(
                    ["pg_dump", "--format=custom"], env=env, stdout=arquivo, stderr=subprocess.PIPE, check=True
                )
            subprocess.run(
                ["pg_restore", "--list", str(dump)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True
            )
            with dump.open("rb") as leitura:
                digest = hashlib.file_digest(leitura, "sha256").hexdigest()
            # Fecha novas conexões somente depois de o backup ter sido validado.
            admin.execute(sql.SQL("ALTER DATABASE {} ALLOW_CONNECTIONS false").format(sql.Identifier(nome)))
            try:
                if admin.execute("SELECT 1 FROM pg_stat_activity WHERE datname=%s", (nome,)).fetchone():
                    raise RuntimeError("Banco passou a ser utilizado; exclusão abortada.")
                admin.execute(sql.SQL("DROP DATABASE {}").format(sql.Identifier(nome)))
            except Exception:
                admin.execute(
                    sql.SQL("ALTER DATABASE {} ALLOW_CONNECTIONS {}").format(
                        sql.Identifier(nome), sql.Literal(existe[0])
                    )
                )
                raise
            resultados.append(
                {
                    "banco": nome,
                    "porta": porta,
                    "resultado": "arquivado e removido",
                    "backup": str(dump),
                    "sha256": digest,
                }
            )
            with os.fdopen(
                os.open(diretorio / "manifesto.json", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w"
            ) as manifesto:
                json.dump(resultados, manifesto, indent=2)
            print(f"Arquivado e removido: {nome} ({porta})", flush=True)
    return resultados


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--diretorio", required=True)
    args = parser.parse_args()
    try:
        limpar(Path(args.diretorio))
    except Exception as erro:
        print("Limpeza interrompida; backups já criados preservados. " + type(erro).__name__)
        raise SystemExit(1) from None
