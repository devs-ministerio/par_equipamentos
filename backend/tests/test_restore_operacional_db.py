"""Restore real e corte ASGI local; não certifica deploy/socket/produção."""

import secrets
from hashlib import sha256

import jwt
import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.pool import NullPool

from app.config import settings
from scripts.corte_restore_sintetico import preparar_corte_restore
from scripts.integridade_recuperacao import integridade_tabelas
from scripts.runtime_clone_recuperacao import _provisionar_na_transacao, validar_runtime_efetivo
from tests.restore_operacional_fixture import cliente_runtime
from tests.restore_operacional_fixture import snapshot_runtime as snapshot_runtime
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel
from tests.test_rollback_snapshot_recuperacao_db import executar_pg, resumo_schema


@pytest.fixture
def restaurado(snapshot_runtime):
    snapshot = snapshot_runtime
    with banco_descartavel() as (destino, _):
        nome = destino.engine.url.database
        destino.execute(text(f'REVOKE ALL ON DATABASE "{nome}" FROM PUBLIC'))
        destino.commit()
        assert sha256(snapshot.arquivo.read_bytes()).hexdigest() == snapshot.sha256
        executar_pg(
            "pg_restore",
            destino,
            [
                "--exit-on-error",
                "--single-transaction",
                "--no-owner",
                "--no-acl",
                str(snapshot.arquivo),
            ],
        )
        assert integridade_tabelas(destino) == snapshot.manifesto
        destino.commit()
        yield destino


def test_restore_reaplica_runtime_e_exige_login_novo_sem_ressuscitar_sessoes(
    snapshot_runtime,
    restaurado,
    monkeypatch,
):
    # Given: backup íntegro em destino privado diferente da origem.
    snapshot, destino = snapshot_runtime, restaurado
    assert resumo_schema(snapshot.origem) == resumo_schema(destino)
    identidades = destino.execute(
        text("""SELECT (to_jsonb(u)-'activation_token_hash'-'activation_expires_at')::text
        FROM public."user" u ORDER BY id""")
    ).all()
    tokens = destino.execute(text("SELECT (to_jsonb(t)-'revoked_at')::text FROM refresh_token t ORDER BY id")).all()
    snapshot.origem.commit()
    destino.commit()
    corte = preparar_corte_restore(destino=destino, esperado=snapshot.manifesto)
    assert corte.sessoes_revogadas == corte.links_invalidados == 1
    assert (
        destino.execute(
            text("""SELECT (to_jsonb(u)-'activation_token_hash'-'activation_expires_at')::text
        FROM public."user" u ORDER BY id""")
        ).all()
        == identidades
    )
    assert (
        destino.execute(text("SELECT (to_jsonb(t)-'revoked_at')::text FROM refresh_token t ORDER BY id")).all()
        == tokens
    )
    assert destino.scalar(text("SELECT count(*) FROM refresh_token WHERE revoked_at IS NULL")) == 0
    assert destino.scalar(text('SELECT count(*) FROM public."user" WHERE activation_token_hash IS NOT NULL')) == 0
    destino.commit()
    role = "sigeo_test_runtime_" + destino.engine.url.database.removeprefix("sigeo_test_migrations_")
    senha = secrets.token_urlsafe(32)
    runtime = None
    try:
        with destino.begin():
            _provisionar_na_transacao(destino, nome_role=role, senha=senha)
        runtime = create_engine(destino.engine.url.set(username=role, password=senha), pool_pre_ping=True)
        with runtime.connect() as conn:
            validar_runtime_efetivo(conn, role)
            assert conn.scalar(text("SELECT session_user=current_user")) is True
            for comando in (
                "CREATE TABLE public.ddl_proibido(id integer)",
                "UPDATE public.alembic_version SET version_num=version_num",
                "DELETE FROM public.audit_log WHERE entity_name='restore_local'",
            ):
                with pytest.raises(DBAPIError) as erro, conn.begin_nested():
                    conn.execute(text(comando))
                assert isinstance(erro.value.orig, DatabaseDriverError) and erro.value.orig.sqlstate == "42501"
        # A role antiga não recebe acesso por ter aparecido na origem do dump.
        antigo = create_engine(snapshot.runtime.url.set(database=destino.engine.url.database), poolclass=NullPool)
        try:
            assert (
                destino.scalar(
                    text("SELECT has_database_privilege(:role,current_database(),'CONNECT')"),
                    {"role": snapshot.runtime.url.username},
                )
                is False
            )
            with pytest.raises(DBAPIError):
                with antigo.connect():
                    pytest.fail("Runtime antigo não pode conectar ao destino restaurado")
        finally:
            antigo.dispose()

        def origem_proibida(*args):
            raise AssertionError("Aplicação tentou usar o pool antigo depois do corte")

        event.listen(snapshot.runtime, "before_cursor_execute", origem_proibida)
        # When: somente a conexão é substituída; auth, rotas e SQL são reais.
        with cliente_runtime(runtime, monkeypatch, ip="198.51.100.213") as http:
            http.cookies.update(snapshot.cookies_snapshot)
            assert http.get("/auth/me").status_code == 401
            csrf = snapshot.cookies_snapshot["sigeo_csrf"]
            assert http.post("/auth/refresh", headers={"X-CSRF-Token": csrf}).status_code == 401
        monkeypatch.setattr(settings, "jwt_secret", secrets.token_urlsafe(48))
        with cliente_runtime(runtime, monkeypatch, ip="198.51.100.214") as http:
            assert http.get("/health").json() == {"status": "ok", "database": "connected"}
            login = http.post(
                "/auth/login",
                json={
                    "email": "admin.homologacao@example.com",
                    "password": snapshot.senha_admin.get_secret_value(),
                },
            )
            assert login.status_code == 200 and http.get("/auth/me").json()["role"] == "admin"
            # A cópia sintética fica na revisão pinada do clone, anterior às colunas novas do catálogo de
            # equipamentos; por isso a leitura do convênio restaurado é conferida direto no banco, e a rota
            # (que carrega o catálogo inteiro) fica de fora. O que a API prova aqui é sessão e papel reais.
            assert http.get("/usuarios").status_code == 200
            assert (
                destino.scalar(text("SELECT situacao FROM convenio WHERE numero='999001'"))
                == "Prestação de Contas Concluída"
            )
            assert destino.scalar(text("SELECT count(*) FROM convenio WHERE numero='999002'")) == 0
            sid_novo = jwt.decode(http.cookies["sigeo_access"], options={"verify_signature": False})["sid"]
            sid_posterior = jwt.decode(
                snapshot.cookies_posteriores["sigeo_access"], options={"verify_signature": False}
            )["sid"]
            # Then: sequência pode reutilizar ID pós-backup; JWT novo impede ressuscitar o cookie antigo.
            assert sid_novo == sid_posterior
        with cliente_runtime(runtime, monkeypatch, ip="198.51.100.215") as http:
            http.cookies.update(snapshot.cookies_posteriores)
            assert http.get("/auth/me").status_code == 401
            csrf = snapshot.cookies_posteriores["sigeo_csrf"]
            assert http.post("/auth/refresh", headers={"X-CSRF-Token": csrf}).status_code == 401
        assert integridade_tabelas(snapshot.origem) == snapshot.pos_snapshot
        assert sha256(snapshot.arquivo.read_bytes()).hexdigest() == snapshot.sha256
        assert (
            destino.scalar(
                text("SELECT details->>'sessoes_revogadas' FROM audit_log WHERE id=:id"), {"id": corte.auditoria_id}
            )
            == "1"
        )
    finally:
        if runtime is not None:
            runtime.dispose()
        destino.rollback()
        if destino.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:role)"), {"role": role}):
            destino.execute(text(f'DROP OWNED BY "{role}"'))
            destino.execute(text(f'DROP ROLE "{role}"'))
        destino.commit()


def test_manifesto_divergente_bloqueia_corte_sem_invalidar_sessoes(snapshot_runtime, restaurado):
    # Arrange
    esperado = {nome: valor for nome, valor in snapshot_runtime.manifesto.items() if nome != "convenio"}
    # Act / Assert
    with pytest.raises(ValueError, match="diverge do manifesto"):
        preparar_corte_restore(destino=restaurado, esperado=esperado)
    assert integridade_tabelas(restaurado) == snapshot_runtime.manifesto


def test_falha_na_auditoria_reverte_revogacao_e_links(snapshot_runtime, restaurado):
    # Arrange: falha real no banco após as duas atualizações de acesso.
    restaurado.execute(
        text("""CREATE FUNCTION falha_auditoria_restore() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'detalhe-privado-sintetico'; END $$""")
    )
    restaurado.execute(
        text("""CREATE TRIGGER falha_auditoria_restore BEFORE INSERT ON public.audit_log
        FOR EACH ROW EXECUTE FUNCTION falha_auditoria_restore()""")
    )
    restaurado.commit()
    # Act / Assert
    with pytest.raises(ValueError, match="transação revertida") as erro:
        preparar_corte_restore(destino=restaurado, esperado=snapshot_runtime.manifesto)
    assert "detalhe-privado-sintetico" not in str(erro.value)
    assert integridade_tabelas(restaurado) == snapshot_runtime.manifesto


def test_destino_com_outro_cliente_nao_pode_ser_liberado(snapshot_runtime, restaurado):
    # Arrange: segunda conexão real simula aplicação liberada antes da hora.
    with restaurado.engine.connect() as concorrente:
        assert concorrente.scalar(text("SELECT current_database()")) == restaurado.engine.url.database
        # Act / Assert
        with pytest.raises(ValueError, match="sem outros clientes"):
            preparar_corte_restore(destino=restaurado, esperado=snapshot_runtime.manifesto)
    assert integridade_tabelas(restaurado) == snapshot_runtime.manifesto


def test_repetir_corte_com_manifesto_original_nao_duplica_auditoria(snapshot_runtime, restaurado):
    # Arrange
    preparar_corte_restore(destino=restaurado, esperado=snapshot_runtime.manifesto)
    depois = integridade_tabelas(restaurado)
    restaurado.commit()
    # Act / Assert
    with pytest.raises(ValueError, match="diverge do manifesto"):
        preparar_corte_restore(destino=restaurado, esperado=snapshot_runtime.manifesto)
    assert integridade_tabelas(restaurado) == depois


def test_transacao_pendente_do_chamador_nao_e_confirmada_ou_revertida(snapshot_runtime, restaurado):
    # Arrange
    restaurado.execute(text("INSERT INTO convenio(numero,convenente_nome) VALUES ('999003','Ensaio pendente')"))
    # Act / Assert
    with pytest.raises(ValueError, match="transação própria"):
        preparar_corte_restore(destino=restaurado, esperado=snapshot_runtime.manifesto)
    assert restaurado.in_transaction()
    assert restaurado.scalar(text("SELECT count(*) FROM convenio WHERE numero='999003'")) == 1
    restaurado.rollback()
    assert integridade_tabelas(restaurado) == snapshot_runtime.manifesto
