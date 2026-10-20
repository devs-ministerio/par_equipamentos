"""Promoção local exata, privada e em quarentena; não habilita o localhost.

Recebe apenas um descartável já adotado e seu manifesto. A cópia promovida
mantém o OID e fica sem conexões até o provisionamento separado do runtime.
Não cria usuários, não sobrescreve bancos e não aceita nomes arbitrários.
"""

import re
import time
from collections.abc import Mapping

from sqlalchemy import Connection, create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

from scripts.adotar_clone_recuperacao import _validar_destino_privado
from scripts.homologacao_local import validar_url_banco
from scripts.integridade_recuperacao import IntegridadeTabela, integridade_tabelas

CLONE_PERSISTENTE = "sigeo_homologacao_clone_20261017"


def _validar_controlador(conn: Connection) -> None:
    validar_url_banco(conn.engine.url.render_as_string(hide_password=False), teste=True)
    if conn.scalar(text("SELECT current_database()")) != conn.engine.url.database:
        raise ValueError("Banco controlador efetivo divergente.")
    endereco, porta = conn.execute(text("SELECT host(inet_server_addr()), inet_server_port()")).one()
    if endereco not in {"127.0.0.1", "::1"} or porta != (conn.engine.url.port or 5432):
        raise ValueError("Servidor efetivo não corresponde ao PostgreSQL loopback autorizado.")


def conferir_copia_para_promocao(conn: Connection, esperado: Mapping[str, IntegridadeTabela]) -> int:
    """Reconfere dados/acesso em transação read-only antes de fechar a conexão."""
    _validar_destino_privado(conn)
    if conn.scalar(text("SHOW transaction_read_only")) != "on":
        raise ValueError("Conferência da promoção exige leitura exclusiva.")
    if not esperado or integridade_tabelas(conn) != esperado:
        raise ValueError("Manifesto da cópia mudou antes da promoção.")
    if conn.scalar(text("SELECT count(*) FROM public.\"user\" WHERE status<>'inactive'")):
        raise ValueError("Há identidades habilitadas antes do provisionamento.")
    if conn.scalar(
        text(
            'SELECT count(*) FROM public."user" WHERE activation_token_hash IS NOT NULL '
            "OR activation_expires_at IS NOT NULL"
        )
    ):
        raise ValueError("Há convites ainda utilizáveis na cópia.")
    if conn.scalar(text("SELECT count(*) FROM public.refresh_token WHERE revoked_at IS NULL")):
        raise ValueError("Há sessões não revogadas na cópia.")
    return conn.execute(text("SELECT oid FROM pg_database WHERE datname=current_database()")).scalar_one()


def _promover_na_transacao(
    conn: Connection, *, nome: str, oid_conferido: int, nome_destino: str = CLONE_PERSISTENTE
) -> int:
    """Kernel transacional, usado também para testar rollback real do rename."""
    if not re.fullmatch(r"sigeo_test_migrations_[a-f0-9]{32}", nome):
        raise ValueError("Promoção exige um descartável gerado pelo ensaio.")
    # O kernel admite outro descartável para ensaiar rename/rollback sem
    # depender da existência do clone persistente. A entrada pública abaixo
    # não expõe esse parâmetro e sempre usa CLONE_PERSISTENTE.
    if nome_destino == nome or (
        nome_destino != CLONE_PERSISTENTE and not re.fullmatch(r"sigeo_test_migrations_[a-f0-9]{32}", nome_destino)
    ):
        raise ValueError("Destino não autorizado para promoção.")
    if not conn.in_transaction():
        raise ValueError("Promoção exige transação explícita.")
    _validar_controlador(conn)
    # Serializa as promoções cooperativas. Colisão externa ainda é recusada
    # pelo catálogo/ALTER DATABASE, nunca resolvida por overwrite.
    conn.execute(text("SELECT pg_advisory_xact_lock(20261017, 1)"))
    if conn.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=:nome)"), {"nome": nome_destino}):
        raise ValueError("Cópia persistente já existe; nenhuma substituição permitida.")
    conn.execute(text("SELECT pg_stat_clear_snapshot()"))
    verificacoes = (
        conn.execute(
            text("""SELECT d.oid=:oid AS identidade, d.datallowconn AS conexoes_habilitadas,
        d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS propriedade,
        NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
            WHERE a.grantee<>d.datdba) AS privado,
        NOT EXISTS (SELECT 1 FROM pg_stat_activity s WHERE s.datid=d.oid) AS sem_sessoes
        FROM pg_database d WHERE d.datname=:nome"""),
            {"oid": oid_conferido, "nome": nome},
        )
        .mappings()
        .one_or_none()
    )
    if verificacoes is None:
        raise ValueError("Cópia não encontrada para promoção.")
    for criterio in ("identidade", "conexoes_habilitadas", "propriedade", "privado", "sem_sessoes"):
        if verificacoes[criterio] is not True:
            raise ValueError("Promoção bloqueada pelo critério: " + criterio)
    conn.execute(text(f'ALTER DATABASE "{nome}" RENAME TO "{nome_destino}"'))
    conn.execute(text(f'ALTER DATABASE "{nome_destino}" ALLOW_CONNECTIONS false'))
    resultado = conn.scalar(
        text("SELECT oid FROM pg_database WHERE datname=:nome AND NOT datallowconn"), {"nome": nome_destino}
    )
    if resultado != oid_conferido:
        raise ValueError("Identidade da cópia promovida divergiu.")
    return oid_conferido


def promover_copia_privada(controlador: Connection, *, nome: str, esperado: Mapping[str, IntegridadeTabela]) -> int:
    """Confere em snapshot RO; fecha o alvo; rename e quarentena atômicos."""
    if controlador.in_transaction():
        raise ValueError("Controlador exige transação própria.")
    if not re.fullmatch(r"sigeo_test_migrations_[a-f0-9]{32}", nome):
        raise ValueError("Nome não autorizado para promoção.")
    try:
        with controlador.begin():
            _validar_controlador(controlador)
        alvo = create_engine(controlador.engine.url.set(database=nome), poolclass=NullPool)
        try:
            with alvo.connect().execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True) as copia:
                oid = conferir_copia_para_promocao(copia, esperado)
                pid_conferencia = copia.execute(text("SELECT pg_backend_pid()")).scalar_one()
        finally:
            alvo.dispose()
        with controlador.begin():
            # close() envia Terminate; o servidor ainda pode estar saindo do
            # backend. Espera limitada somente pelo PID desta conferência.
            # Outras sessões continuam sendo recusadas pelo kernel; sem FORCE.
            limite = time.monotonic() + 2
            while True:
                controlador.execute(text("SELECT pg_stat_clear_snapshot()"))
                encerrando = controlador.scalar(
                    text("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=:pid AND datname=:nome)"),
                    {"pid": pid_conferencia, "nome": nome},
                )
                if not encerrando:
                    break
                if time.monotonic() >= limite:
                    raise ValueError("Conferência ainda conectada; cópia permanece privada.")
                time.sleep(0.025)
            return _promover_na_transacao(controlador, nome=nome, oid_conferido=oid)
    except SQLAlchemyError:
        raise ValueError("Promoção não concluída; nenhum banco existente foi substituído.") from None
