"""Liberação manual da cópia nova; sem CLI, produção ou transporte externo."""

import secrets
import subprocess
from pathlib import Path

from sqlalchemy import Connection, create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.pool import NullPool

from scripts.configuracao_local_recuperacao import (
    cadastrar_contas_locais,
    gerar_senhas_locais,
    gravar_configuracao_privada,
)
from scripts.homologacao_local import validar_url_banco
from scripts.promover_clone_recuperacao import CLONE_PERSISTENTE, _validar_controlador
from scripts.runtime_clone_recuperacao import RUNTIME_LOCAL, _provisionar_na_transacao, validar_runtime_efetivo


def _abrir_quarentena(conn: Connection, oid: int) -> None:
    _validar_controlador(conn)
    conn.execute(text("SELECT pg_stat_clear_snapshot()"))
    registro = conn.execute(
        text("""SELECT d.oid=:oid AND NOT d.datallowconn
        AND d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user)
        AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee<>d.datdba)
        AND NOT EXISTS(SELECT 1 FROM pg_stat_activity s WHERE s.datid=d.oid)
        FROM pg_database d WHERE d.datname=:nome"""),
        {"oid": oid, "nome": CLONE_PERSISTENTE},
    ).scalar_one_or_none()
    if registro is not True:
        raise ValueError("Cópia não corresponde à quarentena privada conferida.")
    if conn.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:role)"), {"role": RUNTIME_LOCAL}):
        raise ValueError("Novo runtime já existe; não será substituído.")
    conn.execute(text(f'ALTER DATABASE "{CLONE_PERSISTENTE}" ALLOW_CONNECTIONS true'))


def provisionar_local(controlador_url: URL, *, oid: int, pasta: Path) -> Path:
    """Cria quatro contas/role transacionalmente; só publica config após conferir TCP.

    Falha depois da abertura volta a bloquear conexões. Não apaga usuários,
    roles, diretórios ou configuração anteriores para repetir uma operação.
    """
    validar_url_banco(controlador_url.render_as_string(hide_password=False), teste=True)
    if not pasta.is_absolute() or pasta.parent.resolve(strict=True) != pasta.parent:
        raise ValueError("Pasta privada exige caminho absoluto sem symlinks.")
    pasta.mkdir(mode=0o700, exist_ok=False)
    config = pasta / ".env.local"
    ignorado = subprocess.run(
        ["git", "check-ignore", "--quiet", "--", str(config)], cwd=pasta.parent, capture_output=True, check=False
    )
    if ignorado.returncode != 0:
        raise ValueError("Configuração precisa estar excluída do versionamento antes de gravar segredos.")
    senha_runtime = secrets.token_urlsafe(48)
    senhas = gerar_senhas_locais()
    dono_url = controlador_url.set(database=CLONE_PERSISTENTE)
    runtime_url = dono_url.set(username=RUNTIME_LOCAL, password=senha_runtime)
    controlador = create_engine(controlador_url, poolclass=NullPool)
    dono = create_engine(dono_url, poolclass=NullPool)
    runtime = create_engine(runtime_url, poolclass=NullPool)
    aberta = False
    try:
        with controlador.begin() as admin:
            _abrir_quarentena(admin, oid)
        aberta = True
        with dono.begin() as conn:
            _provisionar_na_transacao(conn, nome_role=RUNTIME_LOCAL, senha=senha_runtime)
            cadastrar_contas_locais(conn, senhas)
        with runtime.connect() as conn:
            validar_runtime_efetivo(conn, RUNTIME_LOCAL)
            if conn.scalar(text("SELECT count(*) FROM public.\"user\" WHERE status='active'")) != 4:
                raise ValueError("Contas locais não correspondem à matriz de quatro papéis.")
        valores = {
            "DATABASE_URL": runtime_url.render_as_string(hide_password=False),
            "DATABASE_URL_MIGRATION": dono_url.render_as_string(hide_password=False),
            "TEST_DATABASE_URL": controlador_url.render_as_string(hide_password=False),
            "JWT_SECRET": secrets.token_urlsafe(64),
            "COOKIE_SECURE": "false",
            "COOKIE_SAMESITE": "lax",
            "COOKIE_DOMAIN": "",
            "REFRESH_COOKIE_PATH": "/auth",
            "ACCESS_TOKEN_EXPIRE_MINUTES": "60",
            "MAIL_API_URL": "http://127.0.0.1:8002/enviar",
            "MAIL_API_SECRET": secrets.token_urlsafe(48),
            "APP_PUBLIC_URL": "http://127.0.0.1:5181",
            "CORS_ORIGINS": "http://127.0.0.1:5181,http://localhost:5181",
            "ALLOWED_HOSTS": "127.0.0.1,localhost",
            "RATE_LIMIT_STORAGE_URI": "memory://",
            "NEW_RELIC_ENABLED": "false",
            "PORTAL_TRANSPARENCIA_API_KEY": "",
            "SIGEO_LOCAL_READY": "true",
            "SIGEO_LOCAL_DATABASE_OID": str(oid),
        }
        valores.update(
            {
                "SIGEO_LOCAL_" + papel.upper() + "_PASSWORD": segredo.get_secret_value()
                for papel, segredo in senhas.items()
            }
        )
        gravar_configuracao_privada(config, valores)
        return config
    except Exception:
        if aberta:
            with controlador.begin() as admin:
                if (
                    admin.scalar(text("SELECT oid FROM pg_database WHERE datname=:nome"), {"nome": CLONE_PERSISTENTE})
                    != oid
                ):
                    raise ValueError("Cópia mudou durante a liberação; requer revisão manual.") from None
                admin.execute(text(f'ALTER DATABASE "{CLONE_PERSISTENTE}" ALLOW_CONNECTIONS false'))
        raise ValueError("Runtime não liberado; cópia preservada em quarentena para revisão local.") from None
    finally:
        runtime.dispose()
        dono.dispose()
        controlador.dispose()
