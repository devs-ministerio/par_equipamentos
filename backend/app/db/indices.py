"""Índices que dependem do conteúdo do catálogo de marcos.

`uq_evento_marco_fase_geral_ativo` garante um único evento ativo por (instrumento, marco) nos marcos
de fase geral. Um índice parcial não consulta outra tabela, então o predicado lista os ids desses
marcos. Esta função recria o índice quando a lista muda e não faz nada quando já está certo; quem
inclui marco de fase geral no catálogo (seed, migration de dados) deve chamá-la em seguida.
"""

from __future__ import annotations

import re

from sqlalchemy import text
from sqlalchemy.engine import Connection

INDICE_FASE_GERAL = "uq_evento_marco_fase_geral_ativo"


def garantir_indice_unico_fase_geral(conexao: Connection) -> bool:
    """Devolve True quando criou ou recriou o índice. Sem marcos de fase geral no catálogo, não faz nada."""
    ids = sorted(
        int(i) for i in conexao.execute(text("SELECT id FROM marco_catalogo WHERE grupo = 'fase_geral'")).scalars()
    )
    if not ids:
        return False
    atual = conexao.execute(
        text("SELECT indexdef FROM pg_indexes WHERE indexname = :nome"), {"nome": INDICE_FASE_GERAL}
    ).scalar()
    if atual is not None and sorted(int(i) for i in re.findall(r"\((\d+)\)::bigint", atual)) == ids:
        return False
    lista = ", ".join(str(i) for i in ids)
    conexao.execute(text(f"DROP INDEX IF EXISTS {INDICE_FASE_GERAL}"))
    conexao.execute(
        text(
            f"CREATE UNIQUE INDEX {INDICE_FASE_GERAL} ON evento_marco (instrumento_id, marco_id) "
            f"WHERE substituido_por_id IS NULL AND deletado_em IS NULL AND marco_id IN ({lista})"
        )
    )
    return True
