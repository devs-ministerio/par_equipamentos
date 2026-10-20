"""Prepara corte após restore apenas em banco sintético UUID privado.

Sem CLI e sem acesso a clones/produção. O manifesto deve corresponder ao
snapshot restaurado antes de invalidar sessões/links. Não altera senhas,
papéis, dados financeiros ou história; o registro de corte é append-only.
"""

from collections.abc import Mapping
from dataclasses import dataclass

from sqlalchemy import Connection, text
from sqlalchemy.exc import SQLAlchemyError

from scripts.adotar_clone_recuperacao import _validar_destino_privado
from scripts.integridade_recuperacao import IntegridadeTabela, integridade_tabelas


@dataclass(frozen=True)
class CorteRestoreConfirmado:
    sessoes_revogadas: int
    links_invalidados: int
    auditoria_id: int


def preparar_corte_restore(*, destino: Connection, esperado: Mapping[str, IntegridadeTabela]) -> CorteRestoreConfirmado:
    """Uma transação própria; nenhum runtime pode acessar o destino ainda."""
    if destino.in_transaction():
        raise ValueError("Corte exige transação própria, sem trabalho pendente.")
    try:
        with destino.begin():
            _validar_destino_privado(destino)
            destino.execute(text("SET LOCAL lock_timeout='3s'"))
            destino.execute(text("SET LOCAL statement_timeout='60s'"))
            atual = integridade_tabelas(destino)
            tabelas = ",".join(f'public."{nome}"' for nome in sorted(atual))
            destino.execute(text(f"LOCK TABLE {tabelas} IN ACCESS EXCLUSIVE MODE"))
            if integridade_tabelas(destino) != dict(esperado):
                raise ValueError("Restore diverge do manifesto; corte não autorizado.")
            sessoes = destino.scalar(
                text("""
                WITH revogadas AS (
                    UPDATE public.refresh_token SET revoked_at=transaction_timestamp()
                    WHERE revoked_at IS NULL RETURNING id
                ) SELECT count(*) FROM revogadas
            """)
            )
            links = destino.scalar(
                text("""
                WITH invalidados AS (
                    UPDATE public."user" SET activation_token_hash=NULL,activation_expires_at=NULL
                    WHERE activation_token_hash IS NOT NULL OR activation_expires_at IS NOT NULL RETURNING id
                ) SELECT count(*) FROM invalidados
            """)
            )
            if type(sessoes) is not int or type(links) is not int:
                raise ValueError("Contagem do corte não pôde ser confirmada.")
            auditoria_id = destino.scalar(
                text("""INSERT INTO public.audit_log(entity_name,action,details)
                    VALUES ('restore_local','corte',jsonb_build_object(
                        'sintetico',true,'sessoes_revogadas',CAST(:sessoes AS bigint),
                        'links_invalidados',CAST(:links AS bigint))) RETURNING id"""),
                {"sessoes": sessoes, "links": links},
            )
            if type(auditoria_id) is not int:
                raise ValueError("Auditoria do corte não pôde ser confirmada.")
            depois = integridade_tabelas(destino)
            if set(depois) != set(esperado) or any(
                depois[nome] != manifesto
                for nome, manifesto in esperado.items()
                if nome not in {"user", "refresh_token", "audit_log"}
            ):
                raise ValueError("Corte alterou dados fora do escopo de acesso; transação revertida.")
            _validar_destino_privado(destino)
            return CorteRestoreConfirmado(sessoes, links, auditoria_id)
    except SQLAlchemyError:
        raise ValueError("Falha no corte do restore sintético; transação revertida.") from None
