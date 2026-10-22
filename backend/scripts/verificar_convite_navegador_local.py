"""Convite → senha → primeiro login reais, exclusivamente no clone recuperado.

Sem envio externo: usa a caixa local protegida e uma conta nova @example.com,
inativada ao final. Não grava screenshots, traces, tokens ou senhas.
"""

import argparse
import os
import shutil
import subprocess
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from scripts.convite_expirado_local import convite_expirado_sintetico
from scripts.homologacao_local import validar_url_banco
from scripts.servir_local_recuperacao import conferir_ambiente_servido


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, required=True)
    args = parser.parse_args()
    privado = args.env
    if privado.is_symlink() or privado.stat().st_mode & 0o777 != 0o600:
        raise ValueError("Configuração privada 0600 obrigatória.")
    ambiente = {k: v for k, v in dotenv_values(privado).items() if v is not None}
    if ambiente.get("APP_PUBLIC_URL") != "http://127.0.0.1:5181":
        raise ValueError("Convite deve apontar exclusivamente para o frontend local.")
    if ambiente.get("MAIL_API_URL") != "http://127.0.0.1:8002/enviar":
        raise ValueError("Caixa de e-mail exclusivamente local obrigatória.")
    validar_url_banco(ambiente.get("DATABASE_URL", ""))  # Loopback antes de qualquer SQL.
    conferir_ambiente_servido(ambiente)  # Banco, runtime restrito e OID.
    admin = ambiente.get("SIGEO_LOCAL_ADMIN_PASSWORD", "")
    caixa = ambiente.get("MAIL_API_SECRET", "")
    if len(admin) < 10 or len(caixa) < 32:
        raise ValueError("Credenciais locais incompletas.")
    node = shutil.which("node")
    frontend = Path(__file__).resolve().parents[2] / "frontend"
    cli = frontend / "node_modules/@playwright/test/cli.js"
    if node is None or not cli.is_file():
        raise ValueError("Node e Playwright locais são obrigatórios.")
    filho = {k: v for k, v in os.environ.items() if k in {"PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"}}
    filho.update(
        E2E_BASE_URL="http://127.0.0.1:5181",
        E2E_CONVITE_LOCAL="1",
        E2E_SENHA=admin,
        E2E_MAIL_SECRET=caixa,
    )
    # O runtime privado já é gerado na forma canônica. Não importar app.config
    # antes do preflight nem carregar .env de aplicação implicitamente.
    url = make_url(ambiente["DATABASE_URL"])
    if url.drivername != "postgresql+psycopg":
        raise ValueError("Runtime privado deve ter URL PostgreSQL já normalizada.")
    engine = create_engine(url, poolclass=NullPool, hide_parameters=True)
    try:
        with engine.connect() as conn, convite_expirado_sintetico(conn) as token:
            filho["E2E_CONVITE_EXPIRADO_TOKEN"] = token.get_secret_value()
            return subprocess.call(
                [node, str(cli), "test", "--project=convite-local-chromium"], cwd=frontend, env=filho
            )
    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        print("E2E de convite local não liberado; confira configuração privada e serviços locais.")
        raise SystemExit(1) from None
