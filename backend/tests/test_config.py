"""Regressao do bug corrigido em 2026-08-21: database_url_normalizada
reescrevia pra "postgresql+psycopg2://", driver que nem esta instalado
(o projeto usa psycopg v3) -- so nao quebrava localmente porque o .env
ja vinha no formato certo. Cobre exatamente os 3 formatos que um provedor
de nuvem (Railway/Render/Heroku) pode entregar em DATABASE_URL.
"""
import pytest
from pydantic import ValidationError

from app.config import Settings


def test_normaliza_formato_heroku_postgres():
    s = Settings(database_url="postgres://user:pass@host:5432/db")
    assert s.database_url_normalizada == "postgresql+psycopg://user:pass@host:5432/db"


def test_normaliza_formato_postgresql_sem_driver():
    s = Settings(database_url="postgresql://user:pass@host:5432/db")
    assert s.database_url_normalizada == "postgresql+psycopg://user:pass@host:5432/db"


def test_mantem_formato_ja_com_driver_psycopg():
    url = "postgresql+psycopg://user:pass@host:5432/db"
    s = Settings(database_url=url)
    assert s.database_url_normalizada == url


def test_normalizado_nunca_aponta_pro_psycopg2():
    """psycopg2 nao esta nas dependencias (pyproject.toml so tem
    psycopg[binary]) -- qualquer URL normalizada que aponte pra ele
    derruba a aplicacao no boot."""
    for bruta in ["postgres://a@b/c", "postgresql://a@b/c", "postgresql+psycopg://a@b/c"]:
        s = Settings(database_url=bruta)
        assert "psycopg2" not in s.database_url_normalizada


def test_url_do_alembic_usa_driver_psycopg_e_escapa_percentual():
    s = Settings(database_url="postgres://user:p%25ss@host:5432/db", database_url_migration="")

    assert s.database_url_alembic == "postgresql+psycopg://user:p%%25ss@host:5432/db"


def test_url_do_alembic_usa_database_url_migration_quando_definida():
    """Bloco 1 do Plan Mode database: Alembic roda com o role `sigeo_migration`
    (dono do schema), separado do `sigeo_runtime` de runtime -- ver
    `Settings.database_url_migration`."""
    s = Settings(
        database_url="postgres://runtime:pass@host:5432/db",
        database_url_migration="postgres://migration:p%25ss@host:5432/db",
    )

    assert s.database_url_alembic == "postgresql+psycopg://migration:p%%25ss@host:5432/db"


def test_jwt_secret_vazio_derruba_o_boot():
    """Plan Mode segurança 2026-09-16, Bloco 2: JWT_SECRET vazio ou curto
    precisa impedir a instanciação de `Settings` (boot), não só falhar na
    primeira chamada de login/rota autenticada (esse outro guard, em
    runtime, continua coberto em test_monitoramento.py::
    test_create_access_token_exige_jwt_secret)."""
    with pytest.raises(ValidationError):
        Settings(database_url="postgresql+psycopg://user:pass@host:5432/db", jwt_secret="")


def test_jwt_secret_curto_derruba_o_boot():
    with pytest.raises(ValidationError):
        Settings(database_url="postgresql+psycopg://user:pass@host:5432/db", jwt_secret="curto-demais")


def test_jwt_secret_valido_nao_derruba_o_boot():
    s = Settings(
        database_url="postgresql+psycopg://user:pass@host:5432/db",
        jwt_secret="segredo-com-pelo-menos-32-bytes-ok",
    )
    assert s.jwt_secret == "segredo-com-pelo-menos-32-bytes-ok"
