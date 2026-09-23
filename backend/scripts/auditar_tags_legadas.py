"""Audita, sem escrita, tags legadas sem evidência centralizada.

Uso seguro (somente banco PostgreSQL dedicado de teste):

    TEST_DATABASE_URL=postgresql+psycopg://... python -m scripts.auditar_tags_legadas

O relatório é insumo para decisão humana no rollout expand-contract de
``convenio.equipamentos_tags``. Nunca cria marcador, não altera o JSON legado
e não remove a coluna.
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.engine import make_url


def _configurar_url_teste() -> None:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise SystemExit("Defina TEST_DATABASE_URL para auditar um PostgreSQL dedicado de teste.")
    parsed = make_url(url)
    database = (parsed.database or "").lower()
    if parsed.get_backend_name() != "postgresql" or ("test" not in database and "pytest" not in database):
        raise SystemExit("TEST_DATABASE_URL deve apontar para PostgreSQL dedicado com 'test' ou 'pytest' no nome.")
    os.environ["DATABASE_URL"] = url


def coletar_pendencias(db: Any) -> list[dict[str, Any]]:
    """Compara cada tag legada aos nomes de marcadores do mesmo convênio."""
    from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador

    nomes_por_convenio: dict[int, set[str]] = defaultdict(set)
    for convenio_id, nome in db.execute(
        select(EquipamentoMarcador.convenio_id, EquipamentoCatalogo.nome)
        .join(EquipamentoCatalogo, EquipamentoCatalogo.id == EquipamentoMarcador.equipamento_catalogo_id)
        .where(EquipamentoMarcador.convenio_id.is_not(None))
    ):
        assert convenio_id is not None
        nomes_por_convenio[convenio_id].add(nome)

    pendencias: list[dict[str, Any]] = []
    for convenio in db.execute(select(Convenio).where(Convenio.equipamentos_tags.is_not(None))).scalars():
        conhecidos = nomes_por_convenio[convenio.id]
        for tag in sorted({str(tag) for tag in convenio.equipamentos_tags or []} - conhecidos):
            pendencias.append(
                {
                    "convenio": convenio.numero,
                    "tipo_contratacao": convenio.tipo_contratacao,
                    "origem_dado": convenio.origem_dado,
                    "tag_legada": tag,
                    "marcadores_atuais": sorted(conhecidos),
                    "descricao_fonte": [
                        item.get("DESCRICAO_ITEM")
                        for item in (convenio.siconv_raw or {}).get("itens_plano_aplicacao", [])
                        if isinstance(item, dict) and item.get("DESCRICAO_ITEM")
                    ],
                }
            )
    return pendencias


def run() -> int:
    _configurar_url_teste()
    from app.db.base import SessionLocal

    with SessionLocal() as db:
        pendencias = coletar_pendencias(db)
    print(json.dumps({"total": len(pendencias), "pendencias": pendencias}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(run())
