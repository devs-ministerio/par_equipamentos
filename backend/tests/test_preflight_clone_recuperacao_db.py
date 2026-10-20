"""Inventário mínimo não modifica dados e não certifica anonimização."""

from dataclasses import asdict

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import text
from sqlalchemy.exc import InternalError

from alembic import command
from scripts.preflight_clone_recuperacao import inventariar_acesso_clone
from scripts.transferencia_sintetica_recuperacao import integridade_tabelas
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel
from tests.test_rollback_snapshot_recuperacao_db import preparar_historico_sintetico


@pytest.fixture
def banco_preflight():
    with banco_descartavel() as (conn, config):
        command.upgrade(config, "b7f35c806e4a")
        conn.commit()
        yield conn


def test_contagens_sem_segredos_e_sem_alterar_o_banco(banco_preflight):
    conn = banco_preflight
    conn.execute(
        text("""
        UPDATE public."user" SET name='Usuário local ' || id::text,
        email='usuario-local-' || id::text || '@example.com',activation_token_hash=NULL,activation_expires_at=NULL
    """)
    )
    usuario = conn.scalar(
        text("""
        INSERT INTO public."user" (name,email,password_hash,activation_token_hash,activation_expires_at)
        VALUES ('Pessoa identificável','privado@invalid.test','segredo-sintetico','convite-sintetico',now()-interval '1 day')
        RETURNING id
    """)
    )
    conn.execute(
        text("""
        INSERT INTO refresh_token (user_id,token_hash,expires_at,revoked_at) VALUES
        (:id,'sessao-futura',now()+interval '1 day',NULL),
        (:id,'sessao-expirada',now()-interval '1 day',NULL),
        (:id,'sessao-revogada',now()+interval '1 day',now())
    """),
        {"id": usuario},
    )
    conn.execute(
        text("""
        INSERT INTO audit_log (entity_name,action,details) VALUES
        ('user','update',jsonb_build_object('protegido_no_clone_local',true)),
        ('user','update','{"texto":"segredo-sintetico"}'),('user','update',NULL)
    """)
    )
    conn.commit()
    conn.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
    antes = integridade_tabelas(conn)
    observado = inventariar_acesso_clone(conn)
    assert observado.usuarios == antes["user"].linhas
    assert observado.credenciais_a_substituir_no_destino == observado.usuarios
    assert observado.identidades_fora_padrao_protegido == 1
    assert observado.convites_com_segredo_ou_validade == 1  # Expirado também não pode ser reaproveitado.
    assert observado.sessoes_armazenadas == 3
    assert observado.sessoes_potencialmente_validas == 1
    assert observado.auditorias_sem_marcador_protecao == 2
    assert observado.provas_imutaveis_para_revisao == 0
    assert all(type(v) is int for v in asdict(observado).values())
    assert integridade_tabelas(conn) == antes
    assert conn.scalar(text("SHOW transaction_read_only")) == "on"
    with pytest.raises(InternalError) as erro:
        conn.execute(text('UPDATE public."user" SET activation_token_hash=NULL'))
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "25006"


def test_prova_imutavel_e_contada_sem_exportar_ou_reescrever_payload(banco_preflight):
    conn = banco_preflight
    decisao = preparar_historico_sintetico(conn)
    fonte = conn.scalar(
        text("""
        INSERT INTO fonte_captura (fonte,iniciado_em,finalizado_em,status)
        VALUES ('siconv_legado_recaptura',now(),now(),'ok') RETURNING id
    """)
    )
    conn.execute(
        text("""
        INSERT INTO candidato_legado_recaptura
            (candidato_id,captura_id,fonte_captura_id,hash_conteudo,situacao,valor_global,payload_oficial)
        SELECT candidato_id,captura_id,:fonte,:hash,'Concluído',0,jsonb_build_object('texto','privado-sintetico')
        FROM candidato_legado_decisao WHERE id=:id
    """),
        {"fonte": fonte, "hash": "a" * 64, "id": decisao},
    )
    conn.commit()
    conn.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
    antes = integridade_tabelas(conn)
    inventario = inventariar_acesso_clone(conn)
    assert inventario.provas_imutaveis_para_revisao == 1
    assert "privado-sintetico" not in repr(inventario)
    assert integridade_tabelas(conn) == antes


@pytest.mark.parametrize("isolamento,readonly", [("READ COMMITTED", True), ("REPEATABLE READ", False)])
def test_exige_snapshot_somente_leitura(banco_preflight, isolamento, readonly):
    conn = banco_preflight.execution_options(isolation_level=isolamento, postgresql_readonly=readonly)
    with pytest.raises(ValueError, match="snapshot|read-only"):
        inventariar_acesso_clone(conn)


def test_revisao_nao_validada_bloqueia_inventario():
    with banco_descartavel() as (conn, config):
        command.upgrade(config, "a6e24b7f5d39")
        conn.commit()
        conn.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
        with pytest.raises(ValueError, match="Revisão"):
            inventariar_acesso_clone(conn)
