"""Regressao do bug corrigido em 2026-08-21: database_url_normalizada
reescrevia pra "postgresql+psycopg2://", driver que nem esta instalado
(o projeto usa psycopg v3) -- so nao quebrava localmente porque o .env
ja vinha no formato certo. Cobre exatamente os 3 formatos que um provedor
de nuvem (Railway/Render/Heroku) pode entregar em DATABASE_URL.
"""
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
