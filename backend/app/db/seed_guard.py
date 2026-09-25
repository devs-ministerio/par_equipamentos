"""Guarda de ambiente pra scripts de seed sintético (sem PII, só pra dev/
teste). Incidente real 2026-09-25: `tests.fixtures_cobertura` rodado
standalone sem sobrescrever `DATABASE_URL` gravou dado de teste direto no
Neon de produção. `tests/conftest.py` já tem guarda equivalente pro fluxo de
pytest (exige `TEST_DATABASE_URL` com "test"/"pytest" no nome); esta é a
guarda pro fluxo standalone (`uv run python -m ...`)."""

from __future__ import annotations

from app.config import settings


def recusar_se_producao() -> None:
    if "neon.tech" in settings.database_url_normalizada:
        raise SystemExit(
            "Recusado: DATABASE_URL aponta para o Neon (produção). "
            "Aponte DATABASE_URL para um Postgres local antes de rodar este seed."
        )
