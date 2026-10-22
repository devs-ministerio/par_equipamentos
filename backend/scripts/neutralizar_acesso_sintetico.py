"""Ensaio de isolamento de acesso, somente em destino descartável sintético.

Não é anonimização, provisionamento de login ou adoção do clone real. Não
importa Settings/auth, não recebe segredos e não devolve credenciais. Auditoria,
IDs, papéis, vínculos e provas são preservados; somente campos de acesso mudam.
"""

import re
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from hashlib import sha256

from argon2 import PasswordHasher
from sqlalchemy import Connection, text
from sqlalchemy.exc import SQLAlchemyError

from scripts.integridade_recuperacao import REVISAO_DESTINO, IntegridadeTabela, integridade_tabelas

COLUNAS_ACESSO = {
    "user": ("password_hash", "status", "activation_token_hash", "activation_expires_at"),
    "refresh_token": ("token_hash", "revoked_at"),
}


@dataclass(frozen=True)
class AcessoNeutralizado:
    usuarios_inativados: int
    sessoes_neutralizadas: int


def _validar_destino(conn: Connection) -> None:
    url = conn.engine.url
    if (
        url.get_backend_name() != "postgresql"
        or url.host not in {"127.0.0.1", "localhost", "::1"}
        or url.query
        or not re.fullmatch(r"sigeo_test_migrations_[a-f0-9]{32}", url.database or "")
    ):
        raise ValueError("Neutralização aceita somente PostgreSQL local descartável sintético.")
    if conn.scalar(text("SELECT current_database()")) != url.database:
        raise ValueError("Banco efetivo diferente do destino validado.")
    if conn.scalars(text("SELECT version_num FROM public.alembic_version")).all() != [REVISAO_DESTINO]:
        raise ValueError("Destino não está na revisão validada.")


def _resumo_preservado(conn: Connection) -> dict[str, IntegridadeTabela]:
    resultado = integridade_tabelas(conn)
    for tabela, omitidas in COLUNAS_ACESSO.items():
        digest, linhas = sha256(), 0
        # Identificadores são constantes do módulo, nunca entrada externa.
        consulta = text(f'SELECT (to_jsonb(t) - CAST(:omitidas AS text[]))::text FROM public."{tabela}" t ORDER BY id')
        with conn.execute(
            consulta.execution_options(stream_results=True, yield_per=500), {"omitidas": list(omitidas)}
        ) as cursor:
            for valor in cursor.scalars():
                bruto = valor.encode("utf-8")
                digest.update(len(bruto).to_bytes(8, "big"))
                digest.update(bruto)
                linhas += 1
        resultado[tabela] = IntegridadeTabela(linhas=linhas, sha256=digest.hexdigest())
    return resultado


def _neutralizar_na_transacao_sintetica(
    *, destino: Connection, esperado: Mapping[str, IntegridadeTabela]
) -> AcessoNeutralizado:
    """Sem commit/rollback próprio; chamador é dono da transação integral.

    Continua restrita a banco sintético descartável. Propagar qualquer erro
    obriga o chamador a reverter a transação, nunca seguir até commit.
    """
    if not destino.in_transaction():
        raise ValueError("Neutralização composta exige transação ativa do chamador.")
    _validar_destino(destino)
    destino.execute(text("SET LOCAL lock_timeout = '3s'"))
    destino.execute(text("SET LOCAL statement_timeout = '60s'"))
    atual = integridade_tabelas(destino)
    tabelas = ",".join(f'public."{t}"' for t in sorted(atual))
    destino.execute(text(f"LOCK TABLE {tabelas} IN ACCESS EXCLUSIVE MODE"))
    if integridade_tabelas(destino) != dict(esperado):
        raise ValueError("Destino diverge do manifesto; neutralização abortada.")
    preservado = _resumo_preservado(destino)
    senha_inutilizavel = PasswordHasher().hash(secrets.token_urlsafe(64))
    destino.execute(
        text("""UPDATE public."user" SET password_hash=:senha,status='inactive',
            activation_token_hash=NULL,activation_expires_at=NULL"""),
        {"senha": senha_inutilizavel},
    )
    ultimo_id = None
    while True:
        ids = destino.scalars(
            text("""SELECT id FROM public.refresh_token
                WHERE CAST(:ultimo AS bigint) IS NULL OR id > :ultimo ORDER BY id LIMIT 500"""),
            {"ultimo": ultimo_id},
        ).all()
        if not ids:
            break
        lote = [{"id": ident, "hash": sha256(secrets.token_bytes(32)).hexdigest()} for ident in ids]
        destino.execute(
            text("""UPDATE public.refresh_token SET token_hash=:hash,
                revoked_at=coalesce(revoked_at,transaction_timestamp()) WHERE id=:id"""),
            lote,
        )
        confirmados = destino.scalar(
            text("""SELECT count(*) FROM public.refresh_token t
                JOIN unnest(CAST(:ids AS bigint[]),CAST(:hashes AS text[])) p(id,hash)
                    ON t.id=p.id AND t.token_hash=p.hash
                WHERE t.revoked_at IS NOT NULL"""),
            {"ids": ids, "hashes": [linha["hash"] for linha in lote]},
        )
        if confirmados != len(ids):
            raise ValueError("Sessões não foram neutralizadas; transação revertida.")
        ultimo_id = ids[-1]
    if _resumo_preservado(destino) != preservado:
        raise ValueError("Campo não autorizado mudou; neutralização revertida.")
    if destino.scalar(
        text("""SELECT count(*) FROM public."user" WHERE status <> 'inactive' OR password_hash <> :senha
        OR activation_token_hash IS NOT NULL OR activation_expires_at IS NOT NULL"""),
        {"senha": senha_inutilizavel},
    ) or destino.scalar(text("SELECT count(*) FROM public.refresh_token WHERE revoked_at IS NULL")):
        raise ValueError("Acesso não foi integralmente neutralizado; transação revertida.")
    return AcessoNeutralizado(
        usuarios_inativados=atual["user"].linhas, sessoes_neutralizadas=atual["refresh_token"].linhas
    )


def neutralizar_acesso_sintetico(
    *, destino: Connection, esperado: Mapping[str, IntegridadeTabela]
) -> AcessoNeutralizado:
    """Ensaio isolado mantém transação própria; nunca aceita clone/base."""
    if destino.in_transaction():
        raise ValueError("Neutralização exige uma transação própria no destino.")
    try:
        with destino.begin():
            return _neutralizar_na_transacao_sintetica(destino=destino, esperado=esperado)
    except SQLAlchemyError:
        # Erro do driver pode conter valores de linha/parâmetros. Não propagar.
        raise ValueError("Falha SQL na neutralização; transação do destino revertida.") from None
