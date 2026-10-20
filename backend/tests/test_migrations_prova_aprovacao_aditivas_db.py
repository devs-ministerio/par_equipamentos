"""Cadeia real de recaptura/aprovação, com histórico exclusivamente sintético."""

from decimal import Decimal
from uuid import uuid4

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import CheckConstraint, Table, inspect, text
from sqlalchemy.exc import DBAPIError

from alembic import command
from app.db.models_legado import (
    CandidatoLegadoCaptura,
    CandidatoLegadoComponente,
    CandidatoLegadoDecisao,
    CandidatoLegadoRecaptura,
)
from tests.test_cadeia_migrations_recuperacao_db import banco_migrations as banco_migrations
from tests.test_rollback_snapshot_recuperacao_db import preparar_historico_sintetico

ESCOPO = "42d8a91c6f03"
PROVA = "73b91e4c2a06"
APROVACAO = "84c02f5d3b17"
AVISOS = "95d13a6e4c28"


@pytest.fixture
def radar_migrado(banco_migrations):
    conn, config = banco_migrations
    command.upgrade(config, ESCOPO)
    decisao_id = preparar_historico_sintetico(conn)
    historico = (
        conn.execute(
            text("SELECT candidato_id,captura_id,usuario_id FROM candidato_legado_decisao WHERE id=:id"),
            {"id": decisao_id},
        )
        .one()
        ._asdict()
    )
    conn.commit()
    command.upgrade(config, APROVACAO)
    fonte_id = conn.scalar(
        text(
            "INSERT INTO fonte_captura (fonte,iniciado_em,finalizado_em,status) VALUES ('siconv_oficial',now(),now(),'ok') RETURNING id"
        )
    )
    convenio_id = conn.scalar(
        text("INSERT INTO convenio (numero,convenente_nome) VALUES ('999001','Instituição sintética') RETURNING id")
    )
    conn.commit()
    return (
        conn,
        config,
        historico | {"fonte_captura_id": fonte_id, "convenio_id": convenio_id, "decisao_id": decisao_id},
    )


def inserir_prova(conn, referencias, **alteracoes):
    valores = (
        referencias
        | {
            "hash_conteudo": "b" * 64,
            "situacao": "Prestação de Contas Concluída",
            "valor_global": Decimal("1234567890.123456789"),
            "payload_oficial": '{"sintetico":true}',
        }
        | alteracoes
    )
    return conn.scalar(
        text("""
        INSERT INTO candidato_legado_recaptura
            (candidato_id,captura_id,fonte_captura_id,hash_conteudo,situacao,valor_global,payload_oficial)
        VALUES (:candidato_id,:captura_id,:fonte_captura_id,:hash_conteudo,:situacao,:valor_global,CAST(:payload_oficial AS jsonb))
        RETURNING id
    """),
        valores,
    )


def inserir_decisao(conn, referencias, **alteracoes):
    valores = (
        {
            "chave": uuid4(),
            "situacao_anterior": "em_analise",
            "situacao": "aprovado",
            "recaptura_id": None,
            "justificativa": "Aprovação sintética com evidência oficial",
        }
        | referencias
        | alteracoes
    )
    return conn.scalar(
        text("""
        INSERT INTO candidato_legado_decisao
            (candidato_id,captura_id,usuario_id,chave,situacao_anterior,situacao,justificativa,recaptura_id,convenio_id)
        VALUES (:candidato_id,:captura_id,:usuario_id,:chave,:situacao_anterior,:situacao,:justificativa,:recaptura_id,:convenio_id)
        RETURNING id
    """),
        valores,
    )


def test_up_down_up_preserva_decisao_anterior_sem_aprovacoes(radar_migrado):
    conn, config, ref = radar_migrado
    # Arrange: a decisão antiga deve continuar intacta e sem vínculos inventados.
    antes = conn.execute(
        text("SELECT situacao,justificativa,recaptura_id,convenio_id FROM candidato_legado_decisao WHERE id=:id"),
        {"id": ref["decisao_id"]},
    ).one()
    assert tuple(antes) == ("em_analise", "Análise sintética preservada", None, None)
    conn.commit()
    # Act: reverte apenas as expansões novas, sem tocar o histórico.
    command.downgrade(config, ESCOPO)
    assert "candidato_legado_recaptura" not in inspect(conn).get_table_names()
    assert conn.scalar(text("SELECT to_regprocedure('impedir_mutacao_recaptura_legado()')")) is None
    assert "recaptura_id" not in {c["name"] for c in inspect(conn).get_columns("candidato_legado_decisao")}
    conn.commit()
    command.upgrade(config, APROVACAO)
    # Assert: up novamente não altera decisão, actor ou justificativa.
    assert (
        conn.execute(
            text("SELECT situacao,justificativa,recaptura_id,convenio_id FROM candidato_legado_decisao WHERE id=:id"),
            {"id": ref["decisao_id"]},
        ).one()
        == antes
    )
    with pytest.raises(DBAPIError, match="imutável") as erro, conn.begin_nested():
        conn.execute(text("DELETE FROM candidato_legado_decisao WHERE id=:id"), {"id": ref["decisao_id"]})
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"


@pytest.mark.parametrize(
    "alteracao,codigo",
    [
        ({"hash_conteudo": "invalido"}, "23514"),
        ({"situacao": "  "}, "23514"),
        ({"valor_global": Decimal("-0.01")}, "23514"),
        ({"payload_oficial": None}, "23502"),
        ({"fonte_captura_id": 999999}, "23503"),
        ({"captura_id": 999999}, "23503"),
    ],
)
def test_prova_rejeita_conteudo_ou_vinculo_invalido(radar_migrado, alteracao, codigo):
    conn, _, ref = radar_migrado
    with pytest.raises(DBAPIError) as erro, conn.begin_nested():
        inserir_prova(conn, ref, **alteracao)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == codigo
    assert conn.scalar(text("SELECT count(*) FROM candidato_legado_recaptura")) == 0


def test_prova_vincula_candidato_captura_rodada_e_decimal_exato(radar_migrado):
    conn, _, ref = radar_migrado
    outro = conn.scalar(
        text("INSERT INTO candidato_legado (numero,id_proposta) VALUES ('999002','111002') RETURNING id")
    )
    with pytest.raises(DBAPIError) as erro, conn.begin_nested():
        inserir_prova(conn, ref, candidato_id=outro)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23503"
    prova = inserir_prova(conn, ref)
    assert conn.scalar(
        text("SELECT valor_global FROM candidato_legado_recaptura WHERE id=:id"), {"id": prova}
    ) == Decimal("1234567890.123456789")
    with pytest.raises(DBAPIError) as erro, conn.begin_nested():
        inserir_prova(conn, ref)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23505"


@pytest.mark.parametrize(
    "comando",
    [
        "UPDATE candidato_legado_recaptura SET situacao='Alterada' WHERE id=:id",
        "UPDATE candidato_legado_recaptura SET payload_oficial='{}' WHERE id=:id",
        "DELETE FROM candidato_legado_recaptura WHERE id=:id",
    ],
)
def test_trigger_da_migration_impede_mutacao_da_prova(radar_migrado, comando):
    conn, _, ref = radar_migrado
    prova = inserir_prova(conn, ref)
    with pytest.raises(DBAPIError, match="imutável") as erro, conn.begin_nested():
        conn.execute(text(comando), {"id": prova})
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "P0001"
    assert conn.scalar(text("SELECT payload_oficial FROM candidato_legado_recaptura WHERE id=:id"), {"id": prova}) == {
        "sintetico": True
    }


@pytest.mark.parametrize(
    "alteracao",
    [
        {"recaptura_id": None},
        {"convenio_id": None},
        {"situacao": "rejeitado"},
        {"situacao": "em_analise", "situacao_anterior": "novo"},
    ],
)
def test_aprovacao_exige_ambos_vinculos_e_outros_estados_nao_os_aceitam(radar_migrado, alteracao):
    conn, _, ref = radar_migrado
    prova = inserir_prova(conn, ref)
    with pytest.raises(DBAPIError) as erro, conn.begin_nested():
        inserir_decisao(conn, ref | {"recaptura_id": prova}, **alteracao)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    assert conn.scalar(text("SELECT count(*) FROM candidato_legado_decisao")) == 1


def test_aprovacao_rejeita_prova_de_outra_captura_e_convenio_inexistente(radar_migrado):
    conn, _, ref = radar_migrado
    prova = inserir_prova(conn, ref)
    captura = conn.scalar(
        text("""
        INSERT INTO candidato_legado_captura (candidato_id,confirmacao_portal,origem,referencia_snapshot,hash_conteudo)
        VALUES (:id,'nao_consultado','snapshot_local',:hash,:hash) RETURNING id
    """),
        {"id": ref["candidato_id"], "hash": "c" * 64},
    )
    for alteracao in ({"captura_id": captura}, {"convenio_id": 999999}):
        with pytest.raises(DBAPIError) as erro, conn.begin_nested():
            inserir_decisao(conn, ref | {"recaptura_id": prova}, **alteracao)
        assert isinstance(erro.value.orig, DatabaseDriverError)
        assert erro.value.orig.sqlstate == "23503"


def test_aprovacao_e_unica_append_only_e_bloqueia_downgrade(radar_migrado):
    conn, config, ref = radar_migrado
    prova = inserir_prova(conn, ref)
    decisao = inserir_decisao(conn, ref, recaptura_id=prova)
    with pytest.raises(DBAPIError) as erro, conn.begin_nested():
        inserir_decisao(conn, ref, recaptura_id=prova)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23505"
    for comando in (
        "UPDATE candidato_legado_decisao SET justificativa='Alterada' WHERE id=:id",
        "DELETE FROM candidato_legado_decisao WHERE id=:id",
    ):
        with pytest.raises(DBAPIError, match="imutável") as erro, conn.begin_nested():
            conn.execute(text(comando), {"id": decisao})
        assert isinstance(erro.value.orig, DatabaseDriverError)
        assert erro.value.orig.sqlstate == "23514"
    conn.commit()
    with pytest.raises(DBAPIError, match="Reversão bloqueada") as erro:
        command.downgrade(config, PROVA)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    conn.rollback()
    assert conn.scalar(text("SELECT version_num FROM alembic_version")) == APROVACAO
    assert conn.scalar(text("SELECT recaptura_id FROM candidato_legado_decisao WHERE id=:id"), {"id": decisao}) == prova


@pytest.mark.parametrize("reutilizar", ["prova", "convenio"])
def test_prova_e_convenio_nao_podem_ser_reutilizados_em_outra_aprovacao(radar_migrado, reutilizar):
    conn, _, ref = radar_migrado
    prova = inserir_prova(conn, ref)
    inserir_decisao(conn, ref, recaptura_id=prova)
    if reutilizar == "prova":
        convenio = conn.scalar(
            text(
                "INSERT INTO convenio (numero,convenente_nome) VALUES ('999003','Outra instituição sintética') RETURNING id"
            )
        )
        alteracao = {"recaptura_id": prova, "convenio_id": convenio}
        constraint = "uq_legado_decisao_recaptura"
    else:
        fonte = conn.scalar(
            text(
                "INSERT INTO fonte_captura (fonte,iniciado_em,finalizado_em,status) VALUES ('siconv_oficial',now(),now(),'ok') RETURNING id"
            )
        )
        nova_prova = inserir_prova(conn, ref, fonte_captura_id=fonte)
        alteracao = {"recaptura_id": nova_prova}
        constraint = "uq_legado_decisao_convenio"
    with pytest.raises(DBAPIError) as erro, conn.begin_nested():
        inserir_decisao(conn, ref, **alteracao)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23505"
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.diag.constraint_name == constraint


def test_downgrade_preserva_prova_mesmo_sem_aprovacao(radar_migrado):
    conn, config, ref = radar_migrado
    prova = inserir_prova(conn, ref)
    conn.commit()
    command.downgrade(config, PROVA)
    with pytest.raises(DBAPIError, match="Reversão bloqueada") as erro:
        command.downgrade(config, ESCOPO)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    conn.rollback()
    assert conn.scalar(text("SELECT version_num FROM alembic_version")) == PROVA
    assert (
        conn.scalar(text("SELECT hash_conteudo FROM candidato_legado_recaptura WHERE id=:id"), {"id": prova})
        == "b" * 64
    )


@pytest.mark.parametrize("tipo", ["aprovacao_carteira", "convenio_descoberto"])
def test_aviso_novo_bloqueia_reversao_sem_apagar_mensagem(radar_migrado, tipo):
    conn, config, ref = radar_migrado
    command.upgrade(config, AVISOS)
    aviso = conn.scalar(
        text("""
        INSERT INTO notificacao (tipo,titulo,corpo,entidade_id)
        VALUES (CAST(:tipo AS notificacao_tipo),'Aviso sintético','Mensagem preservada',:id)
        RETURNING id
    """),
        {"tipo": tipo, "id": ref["candidato_id"]},
    )
    conn.commit()
    with pytest.raises(DBAPIError, match="preserve avisos") as erro:
        command.downgrade(config, APROVACAO)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    conn.rollback()
    assert conn.scalar(text("SELECT version_num FROM alembic_version")) == AVISOS
    assert conn.execute(text("SELECT tipo::text,corpo FROM notificacao WHERE id=:id"), {"id": aviso}).one() == (
        tipo,
        "Mensagem preservada",
    )


def test_expansao_enum_preserva_literais_anteriores_e_retorna_sem_duplicar(radar_migrado):
    conn, config, _ = radar_migrado
    antigos = list(conn.scalars(text("SELECT unnest(enum_range(NULL::notificacao_tipo))::text")))
    conn.execute(
        text(
            "INSERT INTO notificacao (tipo,titulo,entidade_id) VALUES ('atualizacao_api','Aviso anterior sintético',1)"
        )
    )
    conn.commit()
    command.upgrade(config, AVISOS)
    novos = list(conn.scalars(text("SELECT unnest(enum_range(NULL::notificacao_tipo))::text")))
    assert novos == antigos + ["aprovacao_carteira", "convenio_descoberto"]
    conn.commit()
    command.downgrade(config, APROVACAO)
    assert conn.scalar(text("SELECT titulo FROM notificacao")) == "Aviso anterior sintético"
    assert list(conn.scalars(text("SELECT unnest(enum_range(NULL::notificacao_tipo))::text"))) == novos
    conn.commit()
    command.upgrade(config, AVISOS)
    assert list(conn.scalars(text("SELECT unnest(enum_range(NULL::notificacao_tipo))::text"))) == novos


def test_migrations_correspondem_a_colunas_checks_e_fks_dos_modelos_radar(radar_migrado):
    conn, config, _ = radar_migrado
    command.upgrade(config, "head")
    inspector = inspect(conn)
    for modelo in (CandidatoLegadoCaptura, CandidatoLegadoComponente, CandidatoLegadoRecaptura, CandidatoLegadoDecisao):
        tabela = modelo.__table__
        assert isinstance(tabela, Table)
        esperadas = {c.name: (c.type.compile(dialect=conn.dialect), c.nullable) for c in tabela.columns}
        existentes = {
            c["name"]: (c["type"].compile(dialect=conn.dialect), c["nullable"])
            for c in inspector.get_columns(tabela.name)
        }
        assert existentes == esperadas, tabela.name
        assert {c["name"] for c in inspector.get_check_constraints(tabela.name)} == {
            c.name for c in tabela.constraints if isinstance(c, CheckConstraint)
        }
        fks_modelo = sorted(
            (tuple(c.columns.keys()), tuple(e.target_fullname for e in c.elements), c.ondelete, c.onupdate)
            for c in tabela.foreign_key_constraints
        )
        fks_banco = sorted(
            (
                tuple(c["constrained_columns"]),
                tuple(f"{c['referred_table']}.{col}" for col in c["referred_columns"]),
                c["options"].get("ondelete"),
                c["options"].get("onupdate"),
            )
            for c in inspector.get_foreign_keys(tabela.name)
        )
        assert fks_banco == fks_modelo, tabela.name
