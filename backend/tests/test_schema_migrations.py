"""Regressao de schema: garante que app/db/models.py e o historico de
migrations do Alembic nunca divergem.

Sem isso, ja aconteceram bugs reais so pegos na mao (ver comentario em
Competency, models.py) -- alguem edita um Mapped[...] e esquece de gerar
a migration, ou mexe numa migration ja aplicada em producao. Roda contra
o Postgres configurado em DATABASE_URL (mesmo padrao de
test_pipeline_dedup.py) -- nao sobe banco efemero, entao so serve pra
quem ja tem o head aplicado localmente (ambiente de dev normal).

`alembic upgrade head` fica de fora de propósito: rodar migration dentro
de um teste de leitura arrisca deixar o banco de dev num estado
inesperado se o head mudar no meio do caminho. Quem quer validar que as
migrations rodam limpo do zero usa `alembic upgrade head` numa base
vazia (CI/onboarding), não este teste.
"""

from __future__ import annotations

from sqlalchemy import inspect

from app.db import models  # noqa: F401 -- registra os modelos em Base.metadata
from app.db.base import Base, engine
from scripts.schema_drift import comparar_heads, diff_metadata_vs_banco


def test_head_aplicado_bate_com_models():
    """Falha se `models.py` descreve uma coluna/tabela/constraint que a
    migration mais recente aplicada no banco nao tem (ou vice-versa) --
    autogenerate-diff vazio significa "nada pra gerar", ou seja, banco e
    codigo estao de acordo."""
    diffs = diff_metadata_vs_banco(engine, Base.metadata)

    assert diffs == [], (
        "Divergencia entre app/db/models.py e o schema aplicado no banco "
        f"(rode 'alembic upgrade head' se faltou aplicar uma migration, ou "
        f"'alembic revision --autogenerate' se faltou gerar uma): {diffs}"
    )


def test_head_do_banco_bate_com_head_dos_arquivos_de_migration():
    """Falha se o banco esta apontando pra uma revision que nao e mais a
    ponta do historico em alembic/versions/ (banco desatualizado) --
    complementar ao teste acima, que so olha pro schema em si, nao pro
    ponteiro de revisao."""
    head_do_banco, head_dos_arquivos = comparar_heads(engine)

    assert head_do_banco == head_dos_arquivos, (
        f"Banco esta em {head_do_banco!r}, mas o head dos arquivos de "
        f"migration e {head_dos_arquivos!r} -- rode 'alembic upgrade head'."
    )


def test_fk_fase_geral_declara_acoes_restritivas():
    """A FK não pode depender do default de ON DELETE do PostgreSQL."""
    fks = inspect(engine).get_foreign_keys("evento_marco")
    fase_geral = next(fk for fk in fks if fk["constrained_columns"] == ["fase_geral_id"])

    assert fase_geral["options"] == {"ondelete": "RESTRICT", "onupdate": "RESTRICT"}
