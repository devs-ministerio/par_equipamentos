"""Adaptador exato e6 -> b7 em descartável privado; nunca serve o app.

Sem CLI/Settings e sem criação de bancos/roles. Origem é apenas o clone local
preservado. Destino é recém-migrado e privado, sem outro cliente conectado.
Uma transação; não altera origem/revisão, não usa stamp nem relaxa o ensaio.
"""

from collections.abc import Mapping

from psycopg import Error as ErroPsycopg
from sqlalchemy import Connection, text
from sqlalchemy.exc import SQLAlchemyError

from scripts.integridade_recuperacao import (
    REVISAO_DESTINO,
    IntegridadeTabela,
    _calcular_integridade,
    validar_conexao_sintetica,
)
from scripts.inventario_textos_clone import inventariar_textos_clone, validar_achados_cobertos
from scripts.preflight_clone_recuperacao import CLONE_PRESERVADO, inventariar_acesso_clone
from scripts.schema_adocao_recuperacao import validar_schema_adocao
from scripts.transferencia_sintetica_recuperacao import _copiar_na_transacao_validada


def _validar_origem(conn: Connection) -> None:
    if conn.engine.url.database != CLONE_PRESERVADO:
        raise ValueError("Origem não é o clone preservado autorizado.")
    inventariar_acesso_clone(conn)  # Loopback, nome/revisão efetivos, snapshot RO.
    conn.execute(text("SELECT pg_stat_clear_snapshot()"))
    if conn.scalar(
        text("""SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
        AND pid<>pg_backend_pid() AND backend_type='client backend'""")
    ):
        raise ValueError("Origem tem outros clientes; adoção exige janela local isolada.")


def _validar_destino_privado(conn: Connection) -> None:
    validar_conexao_sintetica(conn)
    if conn.scalars(text("SELECT version_num FROM public.alembic_version")).all() != [REVISAO_DESTINO]:
        raise ValueError("Destino não está na revisão migrada exigida.")
    conn.execute(text("SELECT pg_stat_clear_snapshot()"))
    privado = conn.scalar(
        text("""SELECT d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user)
        AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
            WHERE a.grantee<>d.datdba)
        AND NOT EXISTS (SELECT 1 FROM pg_stat_activity s WHERE s.datname=d.datname
            AND s.pid<>pg_backend_pid() AND s.backend_type='client backend')
        FROM pg_database d WHERE d.datname=current_database()""")
    )
    if privado is not True:
        raise ValueError("Destino deve ser privado do proprietário e sem outros clientes.")


def adotar_clone_em_descartavel(
    *, origem: Connection, destino: Connection, bootstrap: Mapping[str, IntegridadeTabela]
) -> dict[str, IntegridadeTabela]:
    """Projeções, acesso, dados e sequências antes de um único commit.

    Não certifica anonimato global. O gate delimitado exige que não haja sinal
    fora dos campos tratados. Destino nunca é clone operacional já existente.
    """
    if destino.in_transaction():
        raise ValueError("Destino exige transação própria de adoção.")
    try:
        _validar_origem(origem)
        with destino.begin():
            _validar_destino_privado(destino)
            validar_schema_adocao(origem, destino)
            validar_achados_cobertos(inventariar_textos_clone(origem))
            esperado = _calcular_integridade(origem, proteger_identidades_auditoria=True)
            resultado = _copiar_na_transacao_validada(
                origem=origem,
                destino=destino,
                bootstrap=bootstrap,
                esperado=esperado,
                proteger_identidades_auditoria=True,
                isolar_acesso=True,
            )
            _validar_destino_privado(destino)
            _validar_origem(origem)
            return resultado
    except (SQLAlchemyError, ErroPsycopg):
        raise ValueError("Falha na adoção protegida; destino revertido, origem preservada.") from None
