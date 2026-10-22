"""Ensaio de adoção entre descartáveis; não aceita clone, produção ou CLI.

Origem em snapshot read-only; destino já migrado. Substitui apenas bootstrap
confirmado por manifesto, mantendo constraints/triggers e a revisão do destino.
Não autoriza uso com dados reais nem migração de sessões/credenciais reais.
"""

import re
from collections.abc import Mapping

from psycopg import Connection as ConexaoPsycopg
from psycopg import Error as ErroPsycopg
from psycopg import sql
from sqlalchemy import Connection, inspect, text
from sqlalchemy.exc import SQLAlchemyError

from scripts.integridade_recuperacao import PROJECOES_PRIVADAS, REVISAO_DESTINO, validar_conexao_sintetica
from scripts.integridade_recuperacao import IntegridadeTabela as IntegridadeTabela
from scripts.integridade_recuperacao import integridade_tabelas as integridade_tabelas
from scripts.inventario_textos_clone import inventariar_textos_clone, validar_achados_cobertos
from scripts.neutralizar_acesso_sintetico import _neutralizar_na_transacao_sintetica

REVISOES_ORIGEM = frozenset({"a6e24b7f5d39", "b7f35c806e4a"})
BOOTSTRAP = frozenset({"user", "config_decision", "equipamento_catalogo"})
PONTEIROS_CICLICOS = {"candidato_legado": "ultima_captura_id", "competency": "published_execution_id"}


def _driver(conn: Connection) -> ConexaoPsycopg:
    driver = conn.connection.driver_connection
    if not isinstance(driver, ConexaoPsycopg):
        raise ValueError("A transferência exige psycopg.")
    return driver


def _copiar(
    origem: Connection, destino: Connection, tabela: str, colunas: list[str], *, proteger_identidades_auditoria: bool
) -> None:
    privadas = PROJECOES_PRIVADAS.get(tabela, {}) if proteger_identidades_auditoria else {}
    selecao = [
        sql.SQL("NULL::bigint")
        if c == PONTEIROS_CICLICOS.get(tabela)
        else sql.SQL(privadas[c])
        if c in privadas
        else sql.Identifier(c)
        for c in colunas
    ]
    consulta = sql.SQL("COPY (SELECT {} FROM {}) TO STDOUT (FORMAT TEXT, ENCODING 'UTF8')").format(
        sql.SQL(",").join(selecao), sql.Identifier("public", tabela)
    )
    entrada = sql.SQL("COPY {} ({}) FROM STDIN (FORMAT TEXT, ENCODING 'UTF8')").format(
        sql.Identifier("public", tabela), sql.SQL(",").join(map(sql.Identifier, colunas))
    )
    with _driver(origem).cursor().copy(consulta) as leitura, _driver(destino).cursor().copy(entrada) as escrita:
        for bloco in leitura:
            escrita.write(bloco)


def _ordem_tabelas(conn: Connection, tabelas: set[str]) -> list[str]:
    inspector = inspect(conn)
    dependencias = {}
    for tabela in tabelas:
        referencias = set()
        for fk in inspector.get_foreign_keys(tabela, schema="public"):
            if tabela in PONTEIROS_CICLICOS and fk["constrained_columns"] == [PONTEIROS_CICLICOS[tabela]]:
                continue
            if fk["referred_table"] != tabela:
                referencias.add(fk["referred_table"])
        dependencias[tabela] = referencias
    ordenadas: list[str] = []
    while dependencias:
        prontas = sorted(t for t, deps in dependencias.items() if deps <= set(ordenadas))
        if not prontas:
            pendentes = sorted((t, sorted(deps - set(ordenadas))) for t, deps in dependencias.items())
            raise ValueError(f"Ciclo de dependências sem estratégia de cópia validada: {pendentes}")
        for tabela in prontas:
            ordenadas.append(tabela)
            del dependencias[tabela]
    return ordenadas


def _restaurar_ponteiros(origem: Connection, destino: Connection) -> None:
    # Apenas os dois ponteiros mutáveis conhecidos. Não atualizar provas,
    # decisões ou eventos para contornar qualquer proteção de auditoria.
    for tabela, coluna in PONTEIROS_CICLICOS.items():
        temporaria = "ponteiro_recuperacao_" + tabela
        with _driver(destino).cursor() as cursor:
            cursor.execute(
                sql.SQL("CREATE TEMP TABLE {} (id bigint PRIMARY KEY, referencia_id bigint) ON COMMIT DROP").format(
                    sql.Identifier(temporaria)
                )
            )
        saida = sql.SQL("COPY (SELECT id,{} FROM {}) TO STDOUT").format(
            sql.Identifier(coluna), sql.Identifier("public", tabela)
        )
        entrada = sql.SQL("COPY {} (id,referencia_id) FROM STDIN").format(sql.Identifier(temporaria))
        with _driver(origem).cursor().copy(saida) as leitura, _driver(destino).cursor().copy(entrada) as escrita:
            for bloco in leitura:
                escrita.write(bloco)
        with _driver(destino).cursor() as cursor:
            cursor.execute(
                sql.SQL("UPDATE {} c SET {}=p.referencia_id FROM {} p WHERE p.id=c.id").format(
                    sql.Identifier("public", tabela), sql.Identifier(coluna), sql.Identifier(temporaria)
                )
            )


def _restaurar_sequencias(origem: Connection, destino: Connection, tabelas: list[str]) -> None:
    for tabela in tabelas:
        for coluna in inspect(destino).get_columns(tabela, schema="public"):
            if not coluna.get("identity") and not (coluna.get("default") or "").startswith("nextval("):
                continue
            parametros = {"tabela": f'public."{tabela}"', "coluna": coluna["name"]}
            sequencia = origem.execute(
                text("""SELECT n.nspname,c.relname,s.seqincrement
                FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                JOIN pg_sequence s ON s.seqrelid=c.oid
                WHERE c.oid=CAST(pg_get_serial_sequence(:tabela,:coluna) AS regclass)"""),
                parametros,
            ).one()
            if sequencia[0] != "public" or sequencia[2] != 1:
                raise ValueError("Sequência fora do contrato do ensaio.")
            with _driver(origem).cursor() as cursor:
                cursor.execute(
                    sql.SQL("SELECT last_value,is_called FROM {}").format(sql.Identifier(sequencia[0], sequencia[1]))
                )
                estado = cursor.fetchone()
            if estado is None:
                raise ValueError("Estado da sequência ausente.")
            maior = destino.scalar(text(f'SELECT max("{coluna["name"]}") FROM public."{tabela}"'))
            proximo = max(estado[0] + int(estado[1]), (maior or 0) + 1)
            # RESTART é transacional; setval não seria revertido em uma falha.
            with _driver(destino).cursor() as cursor:
                cursor.execute(
                    sql.SQL("ALTER SEQUENCE {} RESTART WITH {}").format(
                        sql.Identifier(sequencia[0], sequencia[1]), sql.Literal(proximo)
                    )
                )


def _transferir_sintetico(
    *,
    origem: Connection,
    destino: Connection,
    bootstrap: Mapping[str, IntegridadeTabela],
    proteger_identidades_auditoria: bool = False,
    isolar_acesso: bool = False,
) -> dict[str, IntegridadeTabela]:
    """Uma transação; modo protegido transforma user/audit antes da gravação.

    Não protege demais textos/payloads e não substitui neutralização de acesso.
    False mantém o ensaio integral para testar preservação sem transformações.
    """
    if destino.in_transaction():
        raise ValueError("Destino precisa iniciar uma transação exclusiva para adoção.")
    # Esta validação começa a transação própria e reverte tudo em qualquer erro.
    with destino.begin():
        nome_origem, nome_destino = validar_conexao_sintetica(origem), validar_conexao_sintetica(destino)
        if nome_origem == nome_destino:
            raise ValueError("Origem e destino devem ser bancos distintos.")
        if (
            origem.scalar(text("SHOW transaction_read_only")) != "on"
            or origem.get_isolation_level() != "REPEATABLE READ"
        ):
            raise ValueError("Origem exige snapshot REPEATABLE READ read-only.")
        if origem.scalar(text("SELECT version_num FROM alembic_version")) not in REVISOES_ORIGEM:
            raise ValueError("Revisão da origem ainda não validada para o ensaio.")
        if destino.scalar(text("SELECT version_num FROM alembic_version")) != REVISAO_DESTINO:
            raise ValueError("Destino não foi migrado à revisão esperada.")
        if isolar_acesso:
            if not proteger_identidades_auditoria:
                raise ValueError("Adoção atômica exige a projeção privada obrigatória.")
            validar_achados_cobertos(inventariar_textos_clone(origem))
        esperado = integridade_tabelas(origem, proteger_identidades_auditoria=proteger_identidades_auditoria)
        return _copiar_na_transacao_validada(
            origem=origem,
            destino=destino,
            bootstrap=bootstrap,
            esperado=esperado,
            proteger_identidades_auditoria=proteger_identidades_auditoria,
            isolar_acesso=isolar_acesso,
        )


def _copiar_na_transacao_validada(
    *,
    origem: Connection,
    destino: Connection,
    bootstrap: Mapping[str, IntegridadeTabela],
    esperado: dict[str, IntegridadeTabela],
    proteger_identidades_auditoria: bool,
    isolar_acesso: bool,
) -> dict[str, IntegridadeTabela]:
    """Núcleo privado de escrita; wrappers validam origem/revisão/privacidade.

    Nunca abre/commita transação. Destino continua obrigatoriamente descartável.
    Origem e manifesto precisam pertencer ao mesmo snapshot validado.
    """
    if (
        not destino.in_transaction()
        or origem.scalar(text("SHOW transaction_read_only")) != "on"
        or origem.get_isolation_level() != "REPEATABLE READ"
    ):
        raise ValueError("Cópia composta exige transação de destino e snapshot read-only de origem.")
    validar_conexao_sintetica(destino)
    destino.execute(text("SET LOCAL lock_timeout = '3s'"))
    destino.execute(text("SET LOCAL statement_timeout = '60s'"))
    tabelas = set(bootstrap)
    if tabelas != set(inspect(destino).get_table_names(schema="public")) - {"alembic_version"} or any(
        not re.fullmatch(r"[a-z][a-z0-9_]*", t) for t in tabelas
    ):
        raise ValueError("Manifesto não cobre o schema de destino.")
    nomes = ",".join(f'public."{t}"' for t in sorted(tabelas))
    destino.execute(text(f"LOCK TABLE {nomes} IN ACCESS EXCLUSIVE MODE"))
    if integridade_tabelas(destino) != dict(bootstrap):
        raise ValueError("Destino mudou após o bootstrap; cópia abortada.")
    if any(d.linhas for t, d in bootstrap.items() if t not in BOOTSTRAP):
        raise ValueError("Destino contém dados além das seeds das migrations.")
    if set(esperado) != tabelas:
        raise ValueError("Origem e destino têm tabelas distintas.")
    ordem = _ordem_tabelas(destino, tabelas)
    for tabela in reversed(ordem):
        if tabela in BOOTSTRAP:
            destino.execute(text(f'DELETE FROM public."{tabela}"'))
    for tabela in ordem:
        colunas = [c["name"] for c in inspect(destino).get_columns(tabela, schema="public")]
        _copiar(origem, destino, tabela, colunas, proteger_identidades_auditoria=proteger_identidades_auditoria)
    _restaurar_ponteiros(origem, destino)
    if integridade_tabelas(destino) != esperado:
        raise ValueError("Conteúdo transferido diverge do snapshot; rollback obrigatório.")
    if isolar_acesso:
        _neutralizar_na_transacao_sintetica(destino=destino, esperado=esperado)
        esperado = integridade_tabelas(destino)
    _restaurar_sequencias(origem, destino, ordem)
    return esperado


def transferir_sintetico(
    *,
    origem: Connection,
    destino: Connection,
    bootstrap: Mapping[str, IntegridadeTabela],
    proteger_identidades_auditoria: bool = False,
) -> dict[str, IntegridadeTabela]:
    """Ensaio integral ou com projeção privada, nunca aceita clone real.

    COPY pode incluir a linha na exceção do driver. No modo protegido,
    substituí-la somente após o rollback, sem propagar esse contexto.
    """
    try:
        return _transferir_sintetico(
            origem=origem,
            destino=destino,
            bootstrap=bootstrap,
            proteger_identidades_auditoria=proteger_identidades_auditoria,
        )
    except (SQLAlchemyError, ErroPsycopg):
        if proteger_identidades_auditoria:
            raise ValueError("Falha na cópia protegida; transação do destino revertida.") from None
        raise


def adotar_sintetico_atomico(
    *, origem: Connection, destino: Connection, bootstrap: Mapping[str, IntegridadeTabela]
) -> dict[str, IntegridadeTabela]:
    """Privacidade, cópia, acesso e sequências em uma transação sintética.

    Não aceita o clone e6. Não permite optar por omitir proteção ou acesso.
    Falha em qualquer etapa deixa somente o bootstrap inicial do destino.
    """
    try:
        return _transferir_sintetico(
            origem=origem,
            destino=destino,
            bootstrap=bootstrap,
            proteger_identidades_auditoria=True,
            isolar_acesso=True,
        )
    except (SQLAlchemyError, ErroPsycopg):
        raise ValueError("Falha na adoção sintética; transação integral revertida.") from None
