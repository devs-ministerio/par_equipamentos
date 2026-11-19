"""Índices que dependem do conteúdo do catálogo de marcos.

`uq_evento_marco_fase_geral_ativo` garante um único evento ativo por (instrumento, marco) nos marcos
de fase geral. Um índice parcial não consulta outra tabela, então o predicado lista os ids desses
marcos. Esta função recria o índice quando a lista muda e não faz nada quando já está certo; quem
inclui marco de fase geral no catálogo (seed, migration de dados) deve chamá-la em seguida.
"""

from __future__ import annotations

import re

from sqlalchemy import bindparam, text
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


INDICE_INAUGURACAO = "uq_evento_marco_inauguracao_ativa"
CODIGOS_INAUGURACAO = ("cronograma_previsao_inauguracao", "cronograma_inauguracao_dispensada")


def garantir_indice_unico_inauguracao(conexao: Connection, *, exigir: bool = True) -> bool:
    """Uma inauguração (prevista, realizada ou dispensada) ativa por instrumento.

    Os dois marcos formam um conjunto: previsão e dispensada são excludentes. Devolve True quando criou o índice.
    Sem os dois marcos no catálogo, não faz nada. Com duplicados, falha com mensagem clara (`exigir=True`, usado
    pela migration) ou só adia (`exigir=False`, usado pelo seed): rodar antes
    `scripts/consolidar_eventos_marco_duplicados --inauguracao --aplicar`.
    """
    ids = sorted(
        int(i)
        for i in conexao.execute(
            text("SELECT id FROM marco_catalogo WHERE codigo IN :codigos").bindparams(
                bindparam("codigos", expanding=True)
            ),
            {"codigos": list(CODIGOS_INAUGURACAO)},
        ).scalars()
    )
    if len(ids) != len(CODIGOS_INAUGURACAO):
        return False
    if conexao.execute(text("SELECT 1 FROM pg_indexes WHERE indexname = :nome"), {"nome": INDICE_INAUGURACAO}).scalar():
        return False
    lista = ", ".join(str(i) for i in ids)
    duplicados = conexao.execute(
        text(
            "SELECT count(*) FROM (SELECT instrumento_id FROM evento_marco "
            f"WHERE substituido_por_id IS NULL AND deletado_em IS NULL AND marco_id IN ({lista}) "
            "GROUP BY instrumento_id HAVING count(*) > 1) d"
        )
    ).scalar()
    if duplicados and not exigir:
        return False
    if duplicados:
        raise RuntimeError(
            f"{duplicados} instrumento(s) com mais de uma inauguração ativa. Rode antes "
            "`python -m scripts.consolidar_eventos_marco_duplicados --inauguracao --aplicar --confirmo-host HOST`."
        )
    conexao.execute(
        text(
            f"CREATE UNIQUE INDEX {INDICE_INAUGURACAO} ON evento_marco (instrumento_id) "
            f"WHERE substituido_por_id IS NULL AND deletado_em IS NULL AND marco_id IN ({lista})"
        )
    )
    return True
