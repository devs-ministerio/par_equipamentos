"""Clone protegido: origem read-only → stream → novo PostgreSQL loopback.

Não sobrescreve banco existente, não grava dump bruto e não imprime segredo.
Execute de backend/, com --source-env apontando para a configuração privada.
"""

import argparse
import json
import os
import re
import secrets
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import psycopg
from argon2 import PasswordHasher
from dotenv import dotenv_values
from psycopg import sql
from pydantic import BaseModel
from sqlalchemy.engine import make_url

from scripts.proteger_clone_local import proteger_banco


class Conferencia(BaseModel):
    tabelas: dict[str, int]
    valores: dict[str, str | None]
    revisoes: list[str]


def validar_destino(host: str, nome: str) -> None:
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("Destino precisa ser loopback.")
    if not re.fullmatch(r"sigeo_(?:homologacao_(?:base|clone)|test_clone)_\d{8}", nome):
        raise ValueError("Nome de destino fora do escopo de clonagem.")


def ambiente_pg(url: str) -> dict[str, str]:
    parsed = make_url(url)
    ambiente = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    ambiente.update(
        PGHOST=parsed.host or "",
        PGPORT=str(parsed.port or 5432),
        PGDATABASE=parsed.database or "",
        PGUSER=parsed.username or "",
        PGPASSWORD=parsed.password or "",
        PGCONNECT_TIMEOUT="20",
    )
    for nome, valor in parsed.query.items():
        if isinstance(valor, str) and nome in ("sslmode", "channel_binding"):
            ambiente["PG" + nome.upper().replace("_", "")] = valor
    return ambiente


def conferir(conexao: psycopg.Connection) -> Conferencia:
    tabelas = [
        r[0]
        for r in conexao.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
        )
    ]
    contagens = {}
    for nome in tabelas:
        linha = conexao.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(nome))).fetchone()
        assert linha is not None
        contagens[nome] = linha[0]
    valores = {}
    for tabela, coluna in (
        ("convenio", "valor_global"),
        ("convenio", "valor_desembolsado"),
        ("convenio", "valor_pago_fornecedor"),
        ("proposta_candidata", "vl_global_proposta"),
    ):
        if tabela in tabelas:
            linha = conexao.execute(
                sql.SQL("SELECT sum({}) FROM {}").format(sql.Identifier(coluna), sql.Identifier(tabela))
            ).fetchone()
            assert linha is not None
            valor = linha[0]
            valores[tabela + "." + coluna] = str(valor) if valor is not None else None
    return Conferencia(
        tabelas=contagens,
        valores=valores,
        revisoes=[r[0] for r in conexao.execute("SELECT version_num FROM alembic_version ORDER BY version_num")],
    )


def gravar_privado(path: Path, conteudo: str) -> None:
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as arquivo:
        arquivo.write(conteudo)


def stream_clone(origem: str, destino: str, snapshot: str) -> None:
    env_origem = ambiente_pg(origem)
    env_origem["PGOPTIONS"] = "-c default_transaction_read_only=on"
    env_destino = ambiente_pg(destino)
    with subprocess.Popen(
        ["pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--snapshot=" + snapshot],
        env=env_origem,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ) as dump:
        with subprocess.Popen(
            [
                "pg_restore",
                "--dbname=" + (make_url(destino).database or ""),
                "--no-owner",
                "--no-privileges",
                "--exit-on-error",
                "--single-transaction",
            ],
            env=env_destino,
            stdin=dump.stdout,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        ) as restore:
            if dump.stdout:
                dump.stdout.close()
                dump.stdout = None
            # stderr pode conter dado bruto em erro de COPY: nunca imprimir.
            _, erro_restore = restore.communicate(timeout=600)
            _, erro_dump = dump.communicate(timeout=600)
            if restore.returncode != 0 or dump.returncode != 0:
                # Só categorias fixas: stderr bruto pode incluir dados de COPY.
                categorias = (
                    b"permission denied",
                    b"version mismatch",
                    b"snapshot",
                    b"row-level security",
                    b"does not exist",
                    b"unrecognized configuration",
                    b"connection",
                )
                causas = [c.decode() for c in categorias if c in (erro_restore + erro_dump).lower()]
                print("Falha de stream: " + (", ".join(causas) or "erro não classificado"), flush=True)
                raise RuntimeError("Dump/restore falhou; base não liberada para o app.")


def criar_banco(admin: psycopg.Connection, nome: str, template: str | None = None) -> None:
    validar_destino(admin.info.host, nome)
    if admin.execute("SELECT 1 FROM pg_database WHERE datname=%s", (nome,)).fetchone():
        raise ValueError("Banco de destino já existe; nenhuma substituição permitida.")
    comando = sql.SQL("CREATE DATABASE {}").format(sql.Identifier(nome))
    if template:
        validar_destino(admin.info.host, template)
        comando += sql.SQL(" TEMPLATE {}").format(sql.Identifier(template))
    admin.execute(comando)
    admin.execute(sql.SQL("REVOKE CONNECT ON DATABASE {} FROM PUBLIC").format(sql.Identifier(nome)))


def configurar_contas(conexao: psycopg.Connection) -> dict[str, str]:
    contas = {}
    for papel in ("admin", "gestor", "colaborador", "leitor"):
        email = papel + ".homologacao@example.com"
        senha = secrets.token_urlsafe(24)
        conexao.execute(
            'INSERT INTO "user" (name,email,password_hash,role,status) VALUES (%s,%s,%s,%s,%s)',
            ("Homologação " + papel, email, PasswordHasher().hash(senha), papel, "active"),
        )
        contas[email] = senha
    return contas


def executar(args: argparse.Namespace) -> None:
    tag = args.data
    nomes = ["sigeo_homologacao_base_" + tag, "sigeo_homologacao_clone_" + tag, "sigeo_test_clone_" + tag]
    for nome in nomes:
        validar_destino("127.0.0.1", nome)
    privado = Path(args.diretorio)
    if privado.exists():
        raise ValueError("Diretório privado já existe; escolha destino novo.")
    valores_env = dotenv_values(args.source_env)
    origem = (
        make_url(valores_env.get("DATABASE_URL") or valores_env.get("DATABASE_URL_MIGRATION") or "")
        .set(drivername="postgresql")
        .render_as_string(hide_password=False)
    )
    if make_url(origem).host in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("Origem configurada é local; não é a produção solicitada.")
    url_admin = make_url(f"postgresql://{args.local_user}@127.0.0.1:{args.local_port}/postgres")
    base_url = url_admin.set(database=nomes[0]).render_as_string(hide_password=False)
    with psycopg.connect(url_admin.render_as_string(hide_password=False), autocommit=True) as admin:
        for nome in nomes:
            if admin.execute("SELECT 1 FROM pg_database WHERE datname=%s", (nome,)).fetchone():
                raise ValueError("Uma base planejada já existe; clonagem abortada.")
        privado.mkdir(mode=0o700, parents=True)
        criar_banco(admin, nomes[0])
        try:
            with psycopg.connect(origem, connect_timeout=20, options="-c default_transaction_read_only=on") as fonte:
                fonte.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                inacessivel = fonte.execute(
                    "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','S') AND NOT CASE WHEN c.relkind='S' THEN has_sequence_privilege(c.oid,'SELECT') ELSE has_table_privilege(c.oid,'SELECT') END LIMIT 1"
                ).fetchone()
                if inacessivel:
                    raise RuntimeError("Origem sem leitura completa; clone parcial proibido.")
                linha_snapshot = fonte.execute("SELECT pg_export_snapshot()").fetchone()
                assert linha_snapshot is not None
                snapshot = linha_snapshot[0]
                original = conferir(fonte)
                print("Snapshot read-only obtido; iniciando stream local.", flush=True)
                stream_clone(origem, base_url, snapshot)
            with psycopg.connect(base_url) as base:
                restaurado = conferir(base)
                if original != restaurado:
                    raise RuntimeError("Contagens, valores ou revisão não correspondem ao snapshot.")
                print("Clone conferido; protegendo dados pessoais e acessos.", flush=True)
                protecoes = proteger_banco(base, list(original.tabelas))
                protegido = conferir(base)
                if protegido != original:
                    raise RuntimeError("Proteção alterou contagens ou valores públicos.")
                contas = configurar_contas(base)
            jwt = secrets.token_urlsafe(64)
            env_migracao = dict(
                os.environ,
                DATABASE_URL=base_url.replace("postgresql://", "postgresql+psycopg://"),
                DATABASE_URL_MIGRATION=base_url.replace("postgresql://", "postgresql+psycopg://"),
                JWT_SECRET=jwt,
            )
            resultado = subprocess.run(
                [str(Path.cwd() / ".venv/bin/alembic"), "upgrade", "head"],
                env=env_migracao,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=120,
            )
            if resultado.returncode:
                raise RuntimeError("Migração local falhou; dados preservados em quarentena.")
            with psycopg.connect(base_url) as base:
                migrado = conferir(base)
            for nome in nomes[1:]:
                criar_banco(admin, nome, nomes[0])
            admin.execute(sql.SQL("ALTER DATABASE {} ALLOW_CONNECTIONS false").format(sql.Identifier(nomes[0])))
            work_url = url_admin.set(database=nomes[1], drivername="postgresql+psycopg").render_as_string(
                hide_password=False
            )
            test_url = url_admin.set(database=nomes[2], drivername="postgresql+psycopg").render_as_string(
                hide_password=False
            )
            env = {
                "DATABASE_URL": work_url,
                "DATABASE_URL_MIGRATION": work_url,
                "TEST_DATABASE_URL": test_url,
                "JWT_SECRET": jwt,
                "COOKIE_SECURE": "false",
                "REFRESH_COOKIE_PATH": "/auth",
                "CORS_ORIGINS": "http://127.0.0.1:5181",
                "ALLOWED_HOSTS": "127.0.0.1,localhost",
                "APP_PUBLIC_URL": "http://127.0.0.1:5181",
                "MAIL_API_URL": "",
                "MAIL_API_SECRET": "",
                "PORTAL_TRANSPARENCIA_API_KEY": "",
                "RATE_LIMIT_STORAGE_URI": "memory://",
                "NEW_RELIC_ENABLED": "false",
            }
            gravar_privado(privado / "homologacao.env", "\n".join(f"{k}={v}" for k, v in env.items()) + "\n")
            gravar_privado(privado / "contas-locais.json", json.dumps(contas, indent=2))
            gravar_privado(
                privado / "conferencia.json",
                json.dumps(
                    {
                        "capturado_em": datetime.now(UTC).isoformat(),
                        "origem": original.model_dump(),
                        "apos_migracoes": migrado.model_dump(),
                        "registros_protegidos": protecoes,
                        "bases": nomes,
                        "contas_sinteticas_adicionadas": 4,
                    },
                    indent=2,
                ),
            )
            print("Clone protegido pronto: " + ", ".join(nomes), flush=True)
            print("Configurações e credenciais em diretório privado; nenhum segredo impresso.")
        except Exception:
            admin.execute(sql.SQL("ALTER DATABASE {} ALLOW_CONNECTIONS false").format(sql.Identifier(nomes[0])))
            raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-env", required=True)
    parser.add_argument("--diretorio", required=True)
    parser.add_argument("--local-user", required=True)
    parser.add_argument("--local-port", type=int, default=5432)
    parser.add_argument("--data", default=datetime.now(UTC).strftime("%Y%m%d"))
    args = parser.parse_args()
    try:
        executar(args)
    except Exception as erro:
        print("Clonagem interrompida com proteção de destino: " + type(erro).__name__)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
