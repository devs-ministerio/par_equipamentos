"""Launcher explícito e restrito ao clone local; não carrega .env de produção."""

import argparse
import fcntl
import os
import re
import secrets
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

import psycopg
from dotenv import dotenv_values, set_key
from psycopg import sql
from sqlalchemy.engine import make_url

LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def validar_url_banco(url: str, *, teste: bool = False) -> None:
    parsed = make_url(url)
    prefixo = "sigeo_test_clone_" if teste else "sigeo_homologacao_clone_"
    if parsed.get_backend_name() != "postgresql" or parsed.host not in LOOPBACK:
        raise ValueError("Homologação exige PostgreSQL loopback explícito.")
    if parsed.query:
        raise ValueError("Parâmetros extras de conexão não são permitidos no clone local.")
    if not re.fullmatch(prefixo + r"\d{8}", parsed.database or ""):
        raise ValueError("Banco fora do escopo do clone protegido.")


def carregar_ambiente(path: Path) -> dict[str, str]:
    if path.stat().st_mode & 0o077:
        raise ValueError("Configuração privada deve ter permissão 0600.")
    valores = {k: v for k, v in dotenv_values(path).items() if v is not None}
    for chave in ("DATABASE_URL", "DATABASE_URL_MIGRATION", "TEST_DATABASE_URL", "JWT_SECRET"):
        if not valores.get(chave):
            raise ValueError("Configuração local obrigatória ausente.")
    validar_url_banco(valores["DATABASE_URL"])
    validar_url_banco(valores["DATABASE_URL_MIGRATION"])
    validar_url_banco(valores["TEST_DATABASE_URL"], teste=True)
    if len(valores["JWT_SECRET"]) < 32:
        raise ValueError("JWT local inválido.")
    for chave in ("MAIL_API_URL", "APP_PUBLIC_URL"):
        if valores.get(chave) and urlsplit(valores[chave]).hostname not in LOOPBACK:
            raise ValueError("Comunicação de homologação deve permanecer em loopback.")
    # Defaults de Settings também precisam ser explícitos para não herdar .env.
    # Os campos obrigatórios locais são instalados antes de importar o módulo,
    # que constrói Settings no import. Não consultar config sem essas guardas.
    os.environ.update(valores)
    from app.config import Settings

    ambiente = {k: v for k, v in os.environ.items() if not k.startswith(("PG", "NEW_RELIC"))}
    for campo, definicao in Settings.model_fields.items():
        chave = campo.upper()
        if chave not in valores and not definicao.is_required():
            ambiente[chave] = "" if definicao.default is None else str(definicao.default)
    ambiente.update(valores, NEW_RELIC_ENABLED="false", PORTAL_TRANSPARENCIA_API_KEY="")
    return ambiente


def preparar(path: Path, ambiente: dict[str, str]) -> None:
    """Provisiona apenas role DML local e gateway sem transporte externo."""
    url = make_url(ambiente["DATABASE_URL_MIGRATION"]).set(drivername="postgresql")
    nome = "sigeo_homologacao_runtime_" + (url.database or "").rsplit("_", 1)[1]
    senha = secrets.token_urlsafe(32)
    with psycopg.connect(url.render_as_string(hide_password=False), autocommit=True) as admin:
        if admin.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (nome,)).fetchone():
            raise ValueError("Role local já existe; preparação não sobrescreve credenciais.")
        admin.execute(
            sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD {}").format(
                sql.Identifier(nome), sql.Literal(senha)
            )
        )
        admin.execute(
            sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                sql.Identifier(url.database or ""), sql.Identifier(nome)
            )
        )
        admin.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(nome)))
        admin.execute(
            sql.SQL("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO {}").format(
                sql.Identifier(nome)
            )
        )
        admin.execute(
            sql.SQL("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO {}").format(sql.Identifier(nome))
        )
    runtime = url.set(drivername="postgresql+psycopg", username=nome, password=senha).render_as_string(
        hide_password=False
    )
    set_key(path, "DATABASE_URL", runtime)
    set_key(path, "MAIL_API_URL", "http://127.0.0.1:8002/enviar")
    set_key(path, "MAIL_API_SECRET", secrets.token_urlsafe(32))
    print("Runtime local sem privilégios administrativos; caixa de e-mail loopback configurada.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, required=True)
    parser.add_argument("acao", choices=("preparar", "app", "testes", "apis-simuladas", "email"))
    args = parser.parse_args()
    ambiente = carregar_ambiente(args.env)
    if args.acao == "preparar":
        preparar(args.env, ambiente)
        return
    if args.acao == "app":
        comando = [".venv/bin/uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001"]
    elif args.acao == "email":
        comando = [
            ".venv/bin/uvicorn",
            "scripts.caixa_email_local:criar_app",
            "--factory",
            "--host",
            "127.0.0.1",
            "--port",
            "8002",
            "--no-access-log",
        ]
    else:
        ambiente["DATABASE_URL"] = ambiente["TEST_DATABASE_URL"]
        ambiente["DATABASE_URL_MIGRATION"] = ambiente["TEST_DATABASE_URL"]
        ambiente["ALLOWED_HOSTS"] = "testserver,127.0.0.1,localhost"
        ambiente["CORS_ORIGINS"] = "http://localhost:5173,http://127.0.0.1:5181"
        comando = [".venv/bin/pytest", "-q", "--tb=short"]
        if args.acao == "apis-simuladas":
            comando.extend(
                [
                    "tests/test_capturas_fonte.py",
                    "tests/test_jobs_capturas_integracao.py",
                    "tests/test_job_siconv_filhas_db.py",
                    "tests/test_job_verificacao_siconv_db.py",
                    "tests/test_descoberta_legado_db.py",
                    "tests/test_descoberta_transferegov_espelho_db.py",
                    "tests/test_job_verificacao_transferegov.py",
                    "tests/test_espelho_diff.py",
                ]
            )
    if args.acao in ("testes", "apis-simuladas"):
        banco = make_url(ambiente["TEST_DATABASE_URL"]).database
        lock = Path("/private/tmp") / f"{banco}-execucao.lock"
        with os.fdopen(os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600), "w") as trava:
            fcntl.flock(trava, fcntl.LOCK_EX | fcntl.LOCK_NB)
            raise SystemExit(subprocess.call(comando, env=ambiente))
    raise SystemExit(subprocess.call(comando, env=ambiente))


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        print("Homologação interrompida: " + type(erro).__name__)
        raise SystemExit(1) from None
