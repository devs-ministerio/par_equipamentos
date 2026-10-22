"""Manifestos dos ensaios sintéticos; não aceita bancos reais/preservados."""

import re
from dataclasses import dataclass
from hashlib import sha256

from sqlalchemy import Connection, inspect, text

REVISAO_DESTINO = "b7f35c806e4a"
PROJECOES_PRIVADAS = {
    "user": {"name": "'Usuário local ' || id::text", "email": "'usuario-local-' || id::text || '@example.com'"},
    "audit_log": {"details": "jsonb_build_object('protegido_no_clone_local',true)"},
}


@dataclass(frozen=True)
class IntegridadeTabela:
    linhas: int
    sha256: str


def validar_conexao_sintetica(conn: Connection) -> str:
    url = conn.engine.url
    if url.get_backend_name() != "postgresql" or url.host not in {"127.0.0.1", "localhost", "::1"} or url.query:
        raise ValueError("Ensaio exige PostgreSQL loopback sem opções extras.")
    nome = url.database or ""
    if not re.fullmatch(r"sigeo_test_migrations_[a-f0-9]{32}", nome):
        raise ValueError("Ensaio aceita somente bancos descartáveis sintéticos.")
    if conn.scalar(text("SELECT current_database()")) != nome:
        raise ValueError("Banco efetivo não corresponde ao destino validado.")
    return nome


def integridade_tabelas(
    conn: Connection, *, proteger_identidades_auditoria: bool = False
) -> dict[str, IntegridadeTabela]:
    """Hashes em streaming; modo protegido projeta só a allowlist privada."""
    validar_conexao_sintetica(conn)
    return _calcular_integridade(conn, proteger_identidades_auditoria=proteger_identidades_auditoria)


def _calcular_integridade(conn: Connection, *, proteger_identidades_auditoria: bool) -> dict[str, IntegridadeTabela]:
    """Núcleo interno: invocar só após guarda específica de origem/destino."""
    conn.execute(text("SET LOCAL TIME ZONE 'UTC'"))
    conn.execute(text("SET LOCAL DateStyle = 'ISO, YMD'"))
    inspector = inspect(conn)
    resultado = {}
    for tabela in inspector.get_table_names(schema="public"):
        if tabela == "alembic_version":
            continue
        if not re.fullmatch(r"[a-z][a-z0-9_]*", tabela):
            raise ValueError("Tabela fora do catálogo esperado.")
        pk = inspector.get_pk_constraint(tabela, schema="public")["constrained_columns"]
        if not pk or any(not re.fullmatch(r"[a-z][a-z0-9_]*", c) for c in pk):
            raise ValueError("A integridade exige chave primária explícita.")
        ordem = ",".join(f'"{c}"' for c in pk)
        projecao = "to_jsonb(t)"
        if proteger_identidades_auditoria and tabela in PROJECOES_PRIVADAS:
            campos = ",".join(f"'{c}',({expr})" for c, expr in PROJECOES_PRIVADAS[tabela].items())
            projecao += f" || jsonb_build_object({campos})"
        consulta = text(f'SELECT ({projecao})::text FROM public."{tabela}" t ORDER BY {ordem}')
        digest, linhas = sha256(), 0
        with conn.execute(consulta.execution_options(stream_results=True, yield_per=500)) as cursor:
            for valor in cursor.scalars():
                if not isinstance(valor, str):
                    raise ValueError("Serialização canônica do PostgreSQL inválida.")
                bruto = valor.encode("utf-8")
                digest.update(len(bruto).to_bytes(8, "big"))
                digest.update(bruto)
                linhas += 1
        resultado[tabela] = IntegridadeTabela(linhas=linhas, sha256=digest.hexdigest())
    return resultado
