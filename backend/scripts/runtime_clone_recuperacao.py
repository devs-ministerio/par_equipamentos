"""Privilégios mínimos do novo runtime; nunca modifica uma role existente."""

import re

import psycopg
from psycopg import sql
from sqlalchemy import Connection, text
from sqlalchemy.exc import SQLAlchemyError

from scripts.integridade_recuperacao import REVISAO_DESTINO
from scripts.promover_clone_recuperacao import CLONE_PERSISTENTE

RUNTIME_LOCAL = "sigeo_homologacao_runtime_20261017"


def validar_destino_runtime(conn: Connection, nome_role: str) -> str:
    url = conn.engine.url
    nome = url.database or ""
    sintetico = re.fullmatch(r"sigeo_test_migrations_([a-f0-9]{32})", nome)
    if not (
        (nome == CLONE_PERSISTENTE and nome_role == RUNTIME_LOCAL)
        or (sintetico and nome_role == "sigeo_test_runtime_" + sintetico[1])
    ):
        raise ValueError("Par banco/runtime fora do escopo da recuperação.")
    if url.get_backend_name() != "postgresql" or url.query or url.host not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("Runtime exige URL PostgreSQL loopback explícita.")
    banco, endereco, porta = conn.execute(
        text("SELECT current_database(),host(inet_server_addr()),inet_server_port()")
    ).one()
    if banco != nome or endereco not in {"127.0.0.1", "::1"} or porta != (url.port or 5432):
        raise ValueError("Servidor ou banco efetivo divergente.")
    if conn.scalars(text("SELECT version_num FROM public.alembic_version")).all() != [REVISAO_DESTINO]:
        raise ValueError("Revisão incompatível com o runtime recuperado.")
    return nome


def _provisionar_na_transacao(conn: Connection, *, nome_role: str, senha: str) -> None:
    """Kernel transacional para provisionamento e ensaios com rollback real."""
    nome = validar_destino_runtime(conn, nome_role)
    if not conn.in_transaction() or len(senha) < 32:
        raise ValueError("Provisionamento exige transação e credencial local forte.")
    privado = conn.scalar(
        text("""SELECT d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user)
        AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee<>d.datdba)
        FROM pg_database d WHERE d.datname=current_database()""")
    )
    if privado is not True:
        raise ValueError("Provisionamento exige cópia privada do proprietário.")
    if conn.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:nome)"), {"nome": nome_role}):
        raise ValueError("Runtime já existe; credencial não será sobrescrita.")
    driver = conn.connection.driver_connection
    if not isinstance(driver, psycopg.Connection):
        raise ValueError("Provisionamento exige driver psycopg auditado.")
    # libpq gera SCRAM antes do DDL: senha em claro nunca entra no SQL/log.
    try:
        verificador = driver.pgconn.encrypt_password(senha.encode(), nome_role.encode(), b"scram-sha-256").decode()
        comando = sql.SQL(
            "CREATE ROLE {} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {}"
        ).format(sql.Identifier(nome_role), sql.Literal(verificador))
        conn.exec_driver_sql(comando.as_string(driver))
    except (psycopg.Error, SQLAlchemyError):
        raise ValueError("Criação da credencial local falhou; transação deve ser revertida.") from None
    conn.execute(text("REVOKE ALL ON SCHEMA public FROM PUBLIC"))
    conn.execute(text(f'GRANT CONNECT ON DATABASE "{nome}" TO "{nome_role}"'))
    conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{nome_role}"'))
    conn.execute(text(f'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "{nome_role}"'))
    conn.execute(text(f'REVOKE INSERT,UPDATE,DELETE ON public.alembic_version FROM "{nome_role}"'))
    conn.execute(text(f'REVOKE UPDATE,DELETE ON public.audit_log FROM "{nome_role}"'))
    conn.execute(text(f'GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "{nome_role}"'))


def validar_runtime_efetivo(conn: Connection, nome_role: str) -> None:
    """Consulta permissões efetivas como o próprio runtime (não como dono)."""
    validar_destino_runtime(conn, nome_role)
    if conn.scalar(text("SELECT current_user")) != nome_role:
        raise ValueError("Conferência não está usando o runtime esperado.")
    flags = conn.execute(
        text("""SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit
        FROM pg_roles WHERE rolname=current_user""")
    ).one()
    if any(flags) or conn.scalar(
        text("""SELECT EXISTS(SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=current_user)""")
    ):
        raise ValueError("Runtime tem privilégios administrativos ou memberships.")
    banco = conn.execute(
        text("""SELECT has_database_privilege(current_database(),'CONNECT'),
        has_database_privilege(current_database(),'CREATE'),has_database_privilege(current_database(),'TEMP'),
        datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user)
        FROM pg_database WHERE datname=current_database()""")
    ).one()
    if tuple(banco) != (True, False, False, False):
        raise ValueError("Privilégios efetivos do banco excedem o runtime.")
    schema = conn.execute(
        text("SELECT has_schema_privilege('public','USAGE'),has_schema_privilege('public','CREATE')")
    ).one()
    if tuple(schema) != (True, False):
        raise ValueError("Privilégios efetivos do schema excedem o runtime.")
    if conn.scalar(
        text("""SELECT has_table_privilege('public.alembic_version','INSERT,UPDATE,DELETE,TRUNCATE')
        OR has_table_privilege('public.audit_log','UPDATE,DELETE,TRUNCATE')""")
    ):
        raise ValueError("Runtime pode alterar revisão ou histórico de auditoria.")
    if not conn.scalar(
        text("""SELECT has_table_privilege('public.convenio','SELECT')
        AND has_table_privilege('public.notificacao','INSERT')
        AND has_table_privilege('public.user','UPDATE')""")
    ):
        raise ValueError("Runtime sem as permissões operacionais necessárias.")
    if conn.scalar(
        text("""SELECT EXISTS(SELECT 1 FROM pg_database d
        WHERE d.datname IN ('sigeo_homologacao_clone_20261006','sigeo_homologacao_base_20261006')
        AND has_database_privilege(d.oid,'CONNECT'))""")
    ):
        raise ValueError("Runtime não deve acessar os clones preservados.")
