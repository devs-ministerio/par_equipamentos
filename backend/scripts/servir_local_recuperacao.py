"""Servidores recuperados: somente novo runtime local, sem credencial de dono."""

import argparse
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from scripts.homologacao_local import carregar_ambiente
from scripts.promover_clone_recuperacao import CLONE_PERSISTENTE
from scripts.runtime_clone_recuperacao import RUNTIME_LOCAL, validar_runtime_efetivo

AMBIENTE_SISTEMA = {"PATH", "PYTHONPATH", "LANG", "LC_ALL", "TZ", "TMPDIR", "VIRTUAL_ENV"}


def ambiente_do_processo(ambiente: dict[str, str], *, caixa: bool = False) -> dict[str, str]:
    """Allowlist; não transmite passwords de teste, URLs de dono ou envs extras."""
    if caixa:
        permitidos = AMBIENTE_SISTEMA | {"MAIL_API_SECRET"}
    else:
        from app.config import Settings

        permitidos = AMBIENTE_SISTEMA | {nome.upper() for nome in Settings.model_fields}
    filho = {chave: valor for chave, valor in ambiente.items() if chave in permitidos}
    filho["NEW_RELIC_ENABLED"] = "false"
    if not caixa:
        filho["DATABASE_URL_MIGRATION"] = ""
        filho["PORTAL_TRANSPARENCIA_API_KEY"] = ""
    return filho


def conferir_ambiente_servido(ambiente: dict[str, str]) -> None:
    if ambiente.get("SIGEO_LOCAL_READY") != "true":
        raise ValueError("Configuração ainda não foi validada para servir localhost.")
    url = make_url(ambiente["DATABASE_URL"])
    if url.database != CLONE_PERSISTENTE or url.username != RUNTIME_LOCAL:
        raise ValueError("Servidor exige a cópia e o runtime novos da recuperação.")
    engine = create_engine(url, poolclass=NullPool)
    try:
        with engine.connect() as conn:
            validar_runtime_efetivo(conn, RUNTIME_LOCAL)
            oid = conn.scalar(text("SELECT oid FROM pg_database WHERE datname=current_database()"))
            if str(oid) != ambiente.get("SIGEO_LOCAL_DATABASE_OID"):
                raise ValueError("Identidade da cópia servida divergente.")
    finally:
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, required=True)
    parser.add_argument("acao", choices=("app", "email"))
    args = parser.parse_args()
    ambiente = carregar_ambiente(args.env)
    conferir_ambiente_servido(ambiente)
    caixa = args.acao == "email"
    comando = [sys.executable, "-m", "uvicorn", "scripts.caixa_email_local:criar_app" if caixa else "app.main:app"]
    if caixa:
        comando.append("--factory")
    comando.extend(["--host", "127.0.0.1", "--port", "8002" if caixa else "8001", "--no-access-log"])
    raise SystemExit(subprocess.call(comando, env=ambiente_do_processo(ambiente, caixa=caixa)))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Servidor local não liberado; confira configuração privada e runtime.")
        raise SystemExit(1) from None
