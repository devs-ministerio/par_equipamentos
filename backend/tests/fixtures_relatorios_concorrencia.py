"""Destino SQL próprio por request; autenticação e domínio permanecem reais."""

from dataclasses import dataclass
from itertools import count
from threading import Barrier, Lock

import pytest
from fastapi import Request
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.auth import hash_password
from app.db.base import get_db
from app.db.models import User, UserRole
from app.main import app
from tests.fixtures_relatorios_matriz import criar_carteira_matriz
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel

SENHA_SINTETICA = "Senha-sintetica-concorrencia-2026!"
CLIENTES = count(1)


@dataclass(frozen=True)
class PedidoRelatorio:
    formato: str
    nivel: str
    filtros: dict[str, str]
    esperados: frozenset[str]
    status: int = 200
    autenticar: bool = True


@pytest.fixture
def relatorios_concorrentes(monkeypatch):
    with banco_descartavel() as (conexao, config):
        command.upgrade(config, "head")
        conexao.commit()
        sessoes = sessionmaker(bind=conexao.engine)
        usuarios = []
        senha_hash = hash_password(SENHA_SINTETICA)
        with sessoes() as db:
            criar_carteira_matriz(db)
            for perfil in (UserRole.admin, UserRole.gestor, UserRole.colaborador, UserRole.leitor):
                email = f"concorrencia-{perfil.value}@example.com"
                db.add(
                    User(name=f"Usuário sintético {perfil.value}", email=email, password_hash=senha_hash, role=perfil)
                )
                usuarios.append(email)
            db.commit()

        observacoes = []
        trava_observacoes = Lock()
        conexoes_prontas = Barrier(4)

        def banco_por_requisicao(request: Request):
            with sessoes() as db:
                if request.url.path == "/relatorios":
                    pid, banco = db.execute(text("SELECT pg_backend_pid(), current_database()")).one()
                    with trava_observacoes:
                        observacoes.append((pid, banco))
                    # Prova quatro transações simultâneas, não apenas quatro
                    # PIDs obtidos em momentos diferentes com NullPool.
                    conexoes_prontas.wait(timeout=30)
                yield db

        def carteira():
            with sessoes() as db:
                return db.execute(text("SELECT to_jsonb(c)::text FROM convenio c ORDER BY numero")).scalars().all()

        monkeypatch.setattr(app, "dependency_overrides", {**app.dependency_overrides, get_db: banco_por_requisicao})
        yield usuarios, observacoes, conexao.engine.url.database, carteira
