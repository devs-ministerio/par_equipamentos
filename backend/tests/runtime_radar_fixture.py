"""Role DML descartável do Radar; não usa credenciais ou roles operacionais."""

import re
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from scripts.homologacao_local import validar_url_banco


def nome_runtime_sintetico(schema: str) -> str:
    correspondencia = re.fullmatch(r"pytest_destinatarios_([a-f0-9]{32})", schema)
    if correspondencia is None:
        raise ValueError("Runtime do ensaio exige schema sintético UUID.")
    return "pytest_radar_runtime_" + correspondencia[1]


@contextmanager
def sessao_runtime_radar(bind: Engine, schema: str) -> Iterator[Session]:
    validar_url_banco(bind.url.render_as_string(hide_password=True), teste=True)
    role = nome_runtime_sintetico(schema)
    criada = False
    try:
        with bind.begin() as dono:
            if dono.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:role)"), {"role": role}):
                raise ValueError("Role do ensaio já existe; não será alterada.")
            # Identificadores derivados exclusivamente do UUID da fixture.
            dono.execute(
                text(
                    f'CREATE ROLE "{role}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB '
                    "NOCREATEROLE NOREPLICATION NOBYPASSRLS"
                )
            )
            dono.execute(text(f'GRANT USAGE ON SCHEMA "{schema}" TO "{role}"'))
            dono.execute(text(f'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "{schema}" TO "{role}"'))
            dono.execute(text(f'GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA "{schema}" TO "{role}"'))
        criada = True
        with bind.connect() as conn:
            try:
                conn.execute(text(f'SET ROLE "{role}"'))
                conn.commit()
                with Session(conn) as db:
                    yield db
            finally:
                conn.rollback()
                try:
                    conn.execute(text("RESET ROLE"))
                    if conn.scalar(text("SELECT current_user=session_user")) is not True:
                        raise ValueError("Conexão do ensaio não retornou ao proprietário.")
                    conn.commit()
                except Exception:
                    conn.invalidate()
                    raise
    finally:
        if criada:
            with bind.begin() as dono:
                # Apenas esta role nova, no banco validado do teste. Nenhum
                # objeto/credencial de runtime da aplicação é alterado.
                dono.execute(text(f'DROP OWNED BY "{role}"'))
                dono.execute(text(f'DROP ROLE "{role}"'))
