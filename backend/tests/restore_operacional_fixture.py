"""Snapshot sintético com login real antes/depois do backup; não usa clones."""

import secrets
from contextlib import contextmanager
from dataclasses import dataclass, field
from hashlib import sha256
from itertools import count
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import get_db
from app.main import app
from scripts.configuracao_local_recuperacao import cadastrar_contas_locais, gerar_senhas_locais
from scripts.integridade_recuperacao import IntegridadeTabela, integridade_tabelas
from scripts.runtime_clone_recuperacao import _provisionar_na_transacao
from tests.test_rollback_snapshot_recuperacao_db import executar_pg, preparar_historico_sintetico
from tests.test_runtime_clone_recuperacao_db import copia_runtime_descartavel

_CLIENTES = count(1)


@dataclass(frozen=True)
class SnapshotRuntime:
    origem: Connection
    runtime: Engine
    arquivo: Path
    sha256: str
    manifesto: dict[str, IntegridadeTabela]
    pos_snapshot: dict[str, IntegridadeTabela]
    senha_admin: SecretStr = field(repr=False)
    cookies_snapshot: dict[str, str] = field(repr=False)
    cookies_posteriores: dict[str, str] = field(repr=False)


@contextmanager
def cliente_runtime(runtime: Engine, monkeypatch, *, ip: str):
    def banco_runtime():
        with Session(runtime) as db:
            yield db

    with monkeypatch.context() as alteracao:
        alteracao.setattr(app, "dependency_overrides", {**app.dependency_overrides, get_db: banco_runtime})
        with TestClient(app, base_url="https://testserver", client=(ip, 40000)) as http:
            yield http


@pytest.fixture
def snapshot_runtime(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", secrets.token_urlsafe(48))
    with copia_runtime_descartavel() as (origem, role):
        preparar_historico_sintetico(origem)
        senhas = gerar_senhas_locais()
        senha_runtime = secrets.token_urlsafe(32)
        with origem.begin():
            _provisionar_na_transacao(origem, nome_role=role, senha=senha_runtime)
            cadastrar_contas_locais(origem, senhas)
            origem.execute(
                text("""INSERT INTO public.convenio(numero,convenente_nome,situacao,valor_global)
                VALUES ('999001','Instituição sintética','Prestação de Contas Concluída',123.456789)""")
            )
            origem.execute(
                text("""UPDATE public."user" SET activation_token_hash=:hash,
                activation_expires_at=now()+interval '1 day' WHERE email='admin.homologacao@example.com'"""),
                {"hash": sha256(secrets.token_bytes(32)).hexdigest()},
            )
        runtime = create_engine(origem.engine.url.set(username=role, password=senha_runtime), pool_pre_ping=True)
        arquivo = tmp_path / "snapshot-runtime.dump"
        try:
            with cliente_runtime(runtime, monkeypatch, ip=f"2001:db8:10:18::{next(_CLIENTES):x}") as http:
                resposta = http.post(
                    "/auth/login",
                    json={
                        "email": "admin.homologacao@example.com",
                        "password": senhas["admin"].get_secret_value(),
                    },
                )
                assert resposta.status_code == 200 and http.get("/auth/me").status_code == 200
                cookies_antes = dict(http.cookies)
            manifesto = integridade_tabelas(origem)
            origem.commit()
            arquivo.touch(mode=0o600, exist_ok=False)
            executar_pg("pg_dump", origem, ["--format=custom", "--no-owner", "--no-acl", "--file", str(arquivo)])
            digest = sha256(arquivo.read_bytes()).hexdigest()
            # RPO é visível: nova sessão e registro posteriores não estão no backup.
            with cliente_runtime(runtime, monkeypatch, ip=f"2001:db8:10:18::{next(_CLIENTES):x}") as http:
                resposta = http.post(
                    "/auth/login",
                    json={
                        "email": "admin.homologacao@example.com",
                        "password": senhas["admin"].get_secret_value(),
                    },
                )
                assert resposta.status_code == 200
                cookies_depois = dict(http.cookies)
            origem.execute(
                text("""INSERT INTO public.convenio(numero,convenente_nome)
                VALUES ('999002','Registro sintético posterior ao backup')""")
            )
            origem.commit()
            pos_snapshot = integridade_tabelas(origem)
            origem.commit()
            runtime.dispose()  # Drena o pool antigo antes de preparar o corte.
            yield SnapshotRuntime(
                origem=origem,
                runtime=runtime,
                arquivo=arquivo,
                sha256=digest,
                manifesto=manifesto,
                pos_snapshot=pos_snapshot,
                senha_admin=senhas["admin"],
                cookies_snapshot=cookies_antes,
                cookies_posteriores=cookies_depois,
            )
        finally:
            runtime.dispose()
