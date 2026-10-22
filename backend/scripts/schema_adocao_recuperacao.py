"""Comparação conservadora de catálogo, sem alterar schema ou tratar linhas."""

import re

from sqlalchemy import Connection, inspect, text


def _tokens_funcao(corpo: str) -> tuple[str, ...]:
    # Preserva espaços/case dentro de strings/identificadores citados. Só a
    # pontuação final opcional do bloco PL/pgSQL é normalizada.
    if any(marca in corpo for marca in ("$", "--", "/*")):
        return (corpo,)
    tokens = re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|:=|<>|!=|<=|>=|[^\s]", corpo)
    if tokens and tokens[-1] == ";":
        tokens.pop()
    return tuple(t if t.startswith(("'", '"')) else t.casefold() for t in tokens)


def _catalogo(conn: Connection) -> dict[str, object]:
    inspector = inspect(conn)
    resultado: dict[str, object] = {}
    for tabela in inspector.get_table_names(schema="public"):
        if tabela == "alembic_version":
            continue
        if not re.fullmatch(r"[a-z][a-z0-9_]*", tabela):
            raise ValueError("Catálogo fora da nomenclatura validada.")
        fks = sorted(inspector.get_foreign_keys(tabela, schema="public"), key=lambda fk: fk["name"] or "")
        uniques = sorted(inspector.get_unique_constraints(tabela, schema="public"), key=lambda uq: uq["name"] or "")
        indices = sorted(inspector.get_indexes(tabela, schema="public"), key=lambda idx: idx["name"] or "")
        colunas = sorted(
            [
                (c["name"], c["type"].compile(dialect=conn.dialect), c["nullable"], c.get("default"), c.get("identity"))
                for c in inspector.get_columns(tabela, schema="public")
            ],
            key=lambda coluna: coluna[0],
        )
        resultado[tabela] = {
            "colunas": colunas,
            "pk": inspector.get_pk_constraint(tabela, schema="public"),
            "fks": fks,
            "uniques": uniques,
            "indices": indices,
        }
    resultado["__enums"] = conn.execute(
        text("""SELECT t.typname,array_agg(e.enumlabel ORDER BY e.enumsortorder)
        FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname""")
    ).all()
    resultado["__triggers"] = conn.execute(
        text("""SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid)
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname""")
    ).all()
    funcoes = conn.execute(
        text("""SELECT p.proname,pg_get_function_identity_arguments(p.oid),
        pg_get_function_result(p.oid),l.lanname,p.provolatile,p.prosecdef,p.proleakproof,p.proparallel,p.proconfig,p.prosrc
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
        WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)""")
    ).all()
    resultado["__funcoes"] = [(*r[:-1], _tokens_funcao(r[-1]) if r[3] == "plpgsql" else r[-1]) for r in funcoes]
    return resultado


def _filtros(conn: Connection, tabela: str, expressao: str) -> tuple[str, ...]:
    plano = conn.scalar(
        text(f'EXPLAIN (FORMAT JSON, COSTS FALSE, VERBOSE TRUE) SELECT 1 FROM public."{tabela}" WHERE {expressao}')
    )
    filtros: list[str] = []

    def visitar(no: dict) -> None:
        for chave in ("Filter", "Index Cond", "Recheck Cond"):
            if chave in no:
                filtros.append(no[chave])
        for filho in no.get("Plans", []):
            visitar(filho)

    visitar(plano[0]["Plan"])
    if not filtros:
        raise ValueError("CHECK divergente sem filtro comparável; revisão obrigatória.")
    return tuple(sorted(set(filtros)))


def validar_schema_adocao(origem: Connection, destino: Connection) -> None:
    """Conexões já validadas pelos wrappers; divergência desconhecida bloqueia."""
    if _catalogo(origem) != _catalogo(destino):
        raise ValueError("Schema, funções ou proteções divergem; adoção bloqueada.")
    a, b = inspect(origem), inspect(destino)
    for conn in (origem, destino):
        conn.execute(text("SET LOCAL enable_indexscan=off"))
        conn.execute(text("SET LOCAL enable_bitmapscan=off"))
        conn.execute(text("SET LOCAL enable_indexonlyscan=off"))
        conn.execute(text("SET LOCAL constraint_exclusion=off"))
    for tabela in a.get_table_names(schema="public"):
        if tabela == "alembic_version":
            continue
        ca = {c["name"]: c["sqltext"] for c in a.get_check_constraints(tabela, schema="public")}
        cb = {c["name"]: c["sqltext"] for c in b.get_check_constraints(tabela, schema="public")}
        if ca.keys() != cb.keys():
            raise ValueError("Catálogo de CHECKs diferente; adoção bloqueada.")
        for nome, expressao in ca.items():
            if expressao != cb[nome] and _filtros(origem, tabela, expressao) != _filtros(destino, tabela, cb[nome]):
                raise ValueError("CHECK não equivalente; adoção bloqueada.")
