"""Comparacao pura entre `app/db/models.py`, o head do Alembic e o banco.

Extraido de `tests/test_schema_migrations.py` (Item 4 do Plan Mode database
2026-09-16, docs/arquitetura/planmode-database-2026-09-16.md) pra ser
reaproveitado fora do pytest -- ver `scripts/auditar_drift_schema.py` (CLI
de relatorio) e `tests/test_schema_migrations.py` (gate de teste, que
importa as mesmas funcoes daqui). Nenhuma funcao aqui levanta `assert` nem
imprime nada -- so devolve dado pro chamador decidir o que fazer.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import Engine
from sqlalchemy.schema import MetaData

BACKEND_DIR = Path(__file__).resolve().parent.parent


def alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return cfg


def diff_metadata_vs_banco(engine: Engine, metadata: MetaData) -> list[Any]:
    """Diff do autogenerate do Alembic entre `metadata` (app/db/models.py) e
    o schema realmente aplicado no banco de `engine`. Lista vazia = de
    acordo."""
    with engine.connect() as conn:
        contexto = MigrationContext.configure(conn)
        return compare_metadata(contexto, metadata)


def comparar_heads(engine: Engine, cfg: Config | None = None) -> tuple[str | None, str | None]:
    """(head_do_banco, head_dos_arquivos) -- iguais quando o banco ja tem a
    migration mais recente aplicada."""
    script = ScriptDirectory.from_config(cfg or alembic_config())
    head_dos_arquivos = script.get_current_head()

    with engine.connect() as conn:
        contexto = MigrationContext.configure(conn)
        head_do_banco = contexto.get_current_revision()

    return head_do_banco, head_dos_arquivos


def tabelas_do_mermaid(caminho: Path) -> set[str]:
    """Nomes de tabela (lowercase) declarados como entidade num
    `erDiagram` Mermaid -- parsing best-effort por regex, nao um parser
    Mermaid completo (formato do arquivo e simples e estavel o bastante
    pra isso, ver docs/database/modelo_er.mermaid)."""
    import re

    texto = caminho.read_text(encoding="utf-8")
    return {match.lower() for match in re.findall(r"^\s{4}([A-Z][A-Z0-9_]*)\s*\{", texto, re.MULTILINE)}
