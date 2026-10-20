"""DDL real de expansão do Radar, exclusivamente em bancos descartáveis."""

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from alembic import command
from tests.test_cadeia_migrations_recuperacao_db import banco_migrations as banco_migrations

ANTERIOR = "b5c6d7e8f9a0"
NOVA = "42d8a91c6f03"


def codigo_delete_restrict(conexao):
    # PostgreSQL 18 diferencia RESTRICT de FK inexistente (commit 086c84b23).
    # O oráculo segue a versão; não aceita qualquer erro de integridade.
    versao = int(conexao.scalar(text("SHOW server_version_num")))
    return "23001" if versao >= 180000 else "23503"


def preparar(banco):
    conexao, config = banco
    command.upgrade(config, ANTERIOR)
    candidato = conexao.scalar(
        text("INSERT INTO candidato_legado (numero, id_proposta) VALUES ('123','456') RETURNING id")
    )
    captura = conexao.scalar(
        text("""
        INSERT INTO candidato_legado_captura
            (candidato_id, confirmacao_portal, origem, referencia_snapshot, hash_conteudo)
        VALUES (:candidato, 'nao_consultado', 'snapshot_local', :hash, :hash) RETURNING id
    """),
        {"candidato": candidato, "hash": "a" * 64},
    )
    conexao.commit()
    command.upgrade(config, NOVA)
    return conexao, config, captura


def test_expansao_preserva_captura_antiga_e_reverte_sem_evidencia_nova(banco_migrations):
    conexao, config, captura = preparar(banco_migrations)
    linha = conexao.execute(
        text("SELECT criterio_escopo, orgao_superior, elegivel FROM candidato_legado_captura WHERE id=:id"),
        {"id": captura},
    ).one()
    assert tuple(linha) == (None, None, True)
    assert "candidato_legado_componente" in inspect(conexao).get_table_names()
    checks = {c["name"] for c in inspect(conexao).get_check_constraints("candidato_legado_captura")}
    assert {
        "ck_legado_criterio_escopo",
        "ck_legado_orgao_escopo",
        "ck_legado_celebracao_siconv",
        "ck_legado_inelegibilidade_rodada",
    } <= checks
    conexao.commit()
    command.downgrade(config, ANTERIOR)
    assert (
        conexao.scalar(text("SELECT hash_conteudo FROM candidato_legado_captura WHERE id=:id"), {"id": captura})
        == "a" * 64
    )
    assert "candidato_legado_componente" not in inspect(conexao).get_table_names()
    conexao.commit()
    command.upgrade(config, NOVA)
    assert conexao.scalar(text("SELECT version_num FROM alembic_version")) == NOVA


@pytest.mark.parametrize(
    "alteracao",
    [
        "criterio_escopo='desconhecido'",
        "criterio_escopo='prioritarios_ms_v1'",
        "orgao_superior='36000'",
        "criterio_escopo='prioritarios_ms_v1', orgao_superior='99999'",
        "criterio_escopo='prioritarios_ms_celebrados_v2', orgao_superior='36000'",
        "elegivel=false",
        "elegivel=false, motivo_inelegibilidade='fora_recorte_oficial'",
        "motivo_inelegibilidade='fora_recorte_oficial'",
    ],
)
def test_constraints_rejeitam_escopo_incompleto_sem_brecha_null(banco_migrations, alteracao):
    conexao, _, captura = preparar(banco_migrations)
    with pytest.raises(IntegrityError) as erro:
        with conexao.begin_nested():
            conexao.execute(text(f"UPDATE candidato_legado_captura SET {alteracao} WHERE id=:id"), {"id": captura})
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    conexao.rollback()


@pytest.mark.parametrize("evidencia", ["escopo", "componente", "data"])
def test_reversao_bloqueia_perda_de_evidencia(banco_migrations, evidencia):
    conexao, config, captura = preparar(banco_migrations)
    if evidencia == "escopo":
        conexao.execute(
            text(
                "UPDATE candidato_legado_captura SET criterio_escopo='prioritarios_ms_celebrados_v2', orgao_superior='36000', data_assinatura_siconv='2026-01-01', data_publicacao_siconv='2026-01-02' WHERE id=:id"
            ),
            {"id": captura},
        )
    elif evidencia == "data":
        conexao.execute(
            text("UPDATE candidato_legado_captura SET data_assinatura_siconv='2026-01-01' WHERE id=:id"),
            {"id": captura},
        )
    else:
        conexao.execute(
            text(
                "INSERT INTO candidato_legado_componente (captura_id,id_programa,nome_programa,componente) VALUES (:id,'123','Programa sintético','Componente sintético')"
            ),
            {"id": captura},
        )
    conexao.commit()
    with pytest.raises(IntegrityError) as erro:
        command.downgrade(config, ANTERIOR)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    conexao.rollback()
    assert conexao.scalar(text("SELECT version_num FROM alembic_version")) == NOVA
    assert "candidato_legado_componente" in inspect(conexao).get_table_names()
    assert conexao.scalar(text("SELECT count(*) FROM candidato_legado_captura")) == 1


def test_componente_exige_captura_programa_numerico_e_unicidade(banco_migrations):
    conexao, _, captura = preparar(banco_migrations)
    sql = text(
        "INSERT INTO candidato_legado_componente (captura_id,id_programa,nome_programa,componente) VALUES (:id,:programa,'Programa sintético','Componente sintético')"
    )
    for parametros, codigo in (
        ({"id": captura, "programa": "abc"}, "23514"),
        ({"id": captura + 100, "programa": "123"}, "23503"),
    ):
        with pytest.raises(IntegrityError) as erro:
            with conexao.begin_nested():
                conexao.execute(sql, parametros)
        assert isinstance(erro.value.orig, DatabaseDriverError)
        assert erro.value.orig.sqlstate == codigo
    conexao.execute(sql, {"id": captura, "programa": "123"})
    with pytest.raises(IntegrityError) as erro:
        with conexao.begin_nested():
            conexao.execute(sql, {"id": captura, "programa": "123"})
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23505"
    with pytest.raises(IntegrityError) as erro:
        with conexao.begin_nested():
            conexao.execute(text("DELETE FROM candidato_legado_captura WHERE id=:id"), {"id": captura})
    assert isinstance(erro.value.orig, DatabaseDriverError)
    referencia = next(
        fk
        for fk in inspect(conexao).get_foreign_keys("candidato_legado_componente")
        if fk["constrained_columns"] == ["captura_id"]
    )
    assert referencia["referred_table"] == "candidato_legado_captura"
    assert referencia["options"]["ondelete"] == "RESTRICT"
    assert erro.value.orig.diag.constraint_name == referencia["name"]
    assert erro.value.orig.sqlstate == codigo_delete_restrict(conexao)
    assert conexao.scalar(text("SELECT count(*) FROM candidato_legado_captura WHERE id=:id"), {"id": captura}) == 1
    assert (
        conexao.scalar(text("SELECT count(*) FROM candidato_legado_componente WHERE captura_id=:id"), {"id": captura})
        == 1
    )
    conexao.rollback()


def test_inelegibilidade_preserva_vinculo_rodada_e_bloqueia_reversao(banco_migrations):
    conexao, config, captura = preparar(banco_migrations)
    fonte = conexao.scalar(
        text("""
        INSERT INTO fonte_captura (fonte,iniciado_em,finalizado_em,status)
        VALUES ('siconv_oficial',now(),now(),'ok') RETURNING id
    """)
    )
    conexao.execute(
        text("""
        UPDATE candidato_legado_captura SET elegivel=false,
            motivo_inelegibilidade='fora_recorte_oficial', fonte_captura_id=:fonte
        WHERE id=:id
    """),
        {"fonte": fonte, "id": captura},
    )
    conexao.commit()
    with pytest.raises(IntegrityError) as erro:
        with conexao.begin_nested():
            conexao.execute(text("DELETE FROM fonte_captura WHERE id=:id"), {"id": fonte})
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == codigo_delete_restrict(conexao)
    assert erro.value.orig.diag.constraint_name == "fk_legado_captura_fonte"
    referencia = next(
        fk
        for fk in inspect(conexao).get_foreign_keys("candidato_legado_captura")
        if fk["name"] == "fk_legado_captura_fonte"
    )
    assert referencia["options"]["ondelete"] == "RESTRICT"
    assert conexao.scalar(text("SELECT count(*) FROM fonte_captura WHERE id=:id"), {"id": fonte}) == 1
    conexao.commit()
    with pytest.raises(IntegrityError) as erro:
        command.downgrade(config, ANTERIOR)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    conexao.rollback()
    assert conexao.execute(
        text("SELECT elegivel, motivo_inelegibilidade, fonte_captura_id FROM candidato_legado_captura WHERE id=:id"),
        {"id": captura},
    ).one() == (False, "fora_recorte_oficial", fonte)
