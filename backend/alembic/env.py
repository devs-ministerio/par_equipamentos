import sys
from logging.config import fileConfig
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db.base import Base
from app.db import models  # noqa: F401 -- registra os modelos em Base.metadata

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url_alembic)

# Eco informativo (nao gate) do host resolvido -- Plan Mode database
# 2026-09-17, Bloco 2: `database_url_alembic` agora tem 3 fontes possiveis
# (DATABASE_URL exportada > DATABASE_URL_MIGRATION > DATABASE_URL de
# runtime); imprimir o host antes de qualquer upgrade/downgrade torna
# visivel qual delas venceu, sempre, independente do comando.
print(
    f"[alembic] host resolvido para migration: {urlsplit(settings.database_url_alembic).hostname}",
    file=sys.stderr,
)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
