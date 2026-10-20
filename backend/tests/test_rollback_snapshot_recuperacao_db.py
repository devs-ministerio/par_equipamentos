"""pg_dump/pg_restore reais sobre bancos descartáveis, nunca clone operacional."""

import os
import re
import shutil
import subprocess
from hashlib import sha256
from uuid import uuid4

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import inspect, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from alembic import command
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel


def executar_pg(programa, conexao, argumentos):
    executavel = shutil.which(programa)
    assert executavel, f"O ensaio exige {programa} instalado. Não pular validação de restore."
    url = conexao.engine.url
    assert url.host in {"127.0.0.1", "localhost", "::1"}
    assert re.fullmatch(r"sigeo_test_migrations_[a-f0-9]{32}", url.database or "")
    ambiente = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    if url.password:
        ambiente["PGPASSWORD"] = url.password  # Nunca senha em argumento/URL de processo.
    subprocess.run(
        [
            executavel,
            "--host",
            url.host,
            "--port",
            str(url.port or 5432),
            "--username",
            url.username,
            "--no-password",
            *argumentos,
            "--dbname",
            url.database,
        ],
        env=ambiente,
        check=True,
        capture_output=True,
        timeout=30,
    )


def resumo_dados(conexao):
    resultado = {}
    for tabela in inspect(conexao).get_table_names():
        assert re.fullmatch(r"[a-z][a-z0-9_]*", tabela)
        # Nomes vêm somente do catálogo do banco recém-criado, nunca da UI.
        conteudo = conexao.scalar(
            text(f'''SELECT coalesce(
            jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb
        )::text FROM "{tabela}" t''')
        )
        resultado[tabela] = sha256(conteudo.encode()).hexdigest()
    return resultado


def preparar_historico_sintetico(conexao, *, justificativa="Análise sintética preservada"):
    # A migration histórica contém nomes/e-mails institucionais estáticos.
    # Proteger TODOS antes de exportar; não gerar dump dessas identidades.
    conexao.execute(
        text("""UPDATE "user" SET
        name = 'Pessoa sintética ' || id::text,
        email = 'snapshot-' || id::text || '@example.com',
        password_hash = '!senha-sintetica-inutilizavel!'
    """)
    )
    usuario_id = conexao.scalar(text('SELECT min(id) FROM "user"'))
    assert usuario_id is not None
    candidato_id = conexao.scalar(
        text("""
        INSERT INTO candidato_legado (numero, id_proposta)
        VALUES ('999001', '111001') RETURNING id
    """)
    )
    captura_id = conexao.scalar(
        text("""
        INSERT INTO candidato_legado_captura (
            candidato_id, confirmacao_portal, data_publicacao, origem, referencia_snapshot, hash_conteudo
        ) VALUES (:id, 'confirmado', DATE '2026-10-02', 'siconv_oficial', :hash, :hash) RETURNING id
    """),
        {"id": candidato_id, "hash": "a" * 64},
    )
    conexao.execute(
        text("UPDATE candidato_legado SET ultima_captura_id=:captura WHERE id=:id"),
        {"captura": captura_id, "id": candidato_id},
    )
    decisao_id = conexao.scalar(
        text("""
        INSERT INTO candidato_legado_decisao (
            candidato_id, captura_id, usuario_id, chave, situacao_anterior, situacao, justificativa
        ) VALUES (:candidato, :captura, :usuario, :chave, 'novo', 'em_analise', :justificativa) RETURNING id
    """),
        {
            "candidato": candidato_id,
            "captura": captura_id,
            "usuario": usuario_id,
            "chave": uuid4(),
            "justificativa": justificativa,
        },
    )
    conexao.commit()
    return decisao_id


def resumo_schema(conexao):
    inspector = inspect(conexao)
    resultado = {}
    for tabela in inspector.get_table_names():
        checks = []
        for check in inspector.get_check_constraints(tabela):
            # pg_dump reemite SQL e PostgreSQL pode distribuir casts de array
            # sem alterar o predicado. Comparar o plano normalizado pelo próprio
            # servidor, não apagar casts por regex nem ignorar os CHECKs.
            assert re.fullmatch(r"[a-z][a-z0-9_]*", tabela)
            plano = conexao.scalar(
                text(
                    f'EXPLAIN (FORMAT JSON, COSTS FALSE, VERBOSE TRUE) SELECT 1 FROM "{tabela}" WHERE {check["sqltext"]}'
                )
            )[0]["Plan"]
            checks.append({"nome": check["name"], "plano": plano, "comentario": check.get("comment")})
        resultado[tabela] = {
            "colunas": [
                {
                    "nome": c["name"],
                    "tipo": str(c["type"]),
                    "nullable": c["nullable"],
                    "default": c.get("default"),
                    "identity": c.get("identity"),
                }
                for c in inspector.get_columns(tabela)
            ],
            "pk": inspector.get_pk_constraint(tabela),
            "fks": sorted(inspector.get_foreign_keys(tabela), key=lambda c: c["name"]),
            "checks": sorted(checks, key=lambda c: c["nome"]),
            "uniques": sorted(inspector.get_unique_constraints(tabela), key=lambda c: c["name"]),
            "indices": sorted(inspector.get_indexes(tabela), key=lambda c: c["name"]),
        }
    return resultado


@pytest.mark.parametrize("revisao", ["b5c6d7e8f9a0", "95d13a6e4c28", "a6e24b7f5d39", "b7f35c806e4a"])
def test_snapshot_restaurado_preserva_dados_revisao_trigger_e_sequence(tmp_path, revisao):
    arquivo = tmp_path / "snapshot-sintetico.dump"
    with banco_descartavel() as (origem, config):
        command.upgrade(config, revisao)
        decisao_id = preparar_historico_sintetico(origem)
        prova_id = None
        if revisao != "b5c6d7e8f9a0":
            fonte_id = origem.scalar(
                text(
                    "INSERT INTO fonte_captura (fonte,iniciado_em,finalizado_em,status) VALUES ('siconv_oficial',now(),now(),'ok') RETURNING id"
                )
            )
            prova_id = origem.scalar(
                text("""
                INSERT INTO candidato_legado_recaptura
                    (candidato_id,captura_id,fonte_captura_id,hash_conteudo,situacao,valor_global,payload_oficial)
                SELECT candidato_id,captura_id,:fonte,:hash,'Prestação de Contas Concluída',123.456789,CAST(:payload AS jsonb)
                FROM candidato_legado_decisao WHERE id=:id RETURNING id
            """),
                {"fonte": fonte_id, "hash": "b" * 64, "id": decisao_id, "payload": '{"sintetico":true}'},
            )
            origem.commit()
        if revisao in {"a6e24b7f5d39", "b7f35c806e4a"}:
            origem.execute(
                text("""
                INSERT INTO convenio (numero,convenente_nome,fora_escopo_equipamentos)
                VALUES ('971252','Instituição sintética',true)
            """)
            )
            origem.commit()
        if revisao == "b7f35c806e4a":
            origem.execute(text("INSERT INTO candidato_legado (numero,id_proposta) VALUES ('7ATEST','111003')"))
            origem.commit()
        antes = resumo_dados(origem)
        schema_antes = resumo_schema(origem)
        enums = list(
            origem.execute(
                text("""SELECT t.typname,e.enumlabel,e.enumsortorder
            FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
            WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder""")
            )
        )
        origem.commit()  # pg_dump usa outra conexão; snapshot só de dados confirmados.
        executar_pg("pg_dump", origem, ["--format=custom", "--no-owner", "--no-acl", "--file", str(arquivo)])
        arquivo.chmod(0o600)
        assert arquivo.stat().st_size > 0
        digest = sha256(arquivo.read_bytes()).hexdigest()
        # Alteração posterior ao snapshot em origem descartável. Não inventar
        # revision Alembic nem modificar história append-only para simular falha.
        origem.execute(text("CREATE TABLE mudanca_posterior_snapshot (id bigint PRIMARY KEY, descricao text NOT NULL)"))
        origem.execute(text("INSERT INTO mudanca_posterior_snapshot VALUES (1, 'Mudança sintética posterior')"))
        origem.commit()
        depois_na_origem = resumo_dados(origem)
        origem.commit()
        with banco_descartavel() as (restaurado, _):
            assert inspect(restaurado).get_table_names() == []
            restaurado.commit()
            executar_pg(
                "pg_restore",
                restaurado,
                ["--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", str(arquivo)],
            )
            assert sha256(arquivo.read_bytes()).hexdigest() == digest
            assert resumo_dados(restaurado) == antes
            assert resumo_schema(restaurado) == schema_antes
            assert "mudanca_posterior_snapshot" not in inspect(restaurado).get_table_names()
            assert restaurado.scalar(text("SELECT version_num FROM alembic_version")) == revisao
            depois_enums = list(
                restaurado.execute(
                    text("""SELECT t.typname,e.enumlabel,e.enumsortorder
                FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
                WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder""")
                )
            )
            assert depois_enums == enums
            with pytest.raises(IntegrityError, match="imutável") as erro, restaurado.begin_nested():
                restaurado.execute(text("DELETE FROM candidato_legado_decisao WHERE id=:id"), {"id": decisao_id})
            assert isinstance(erro.value.orig, DatabaseDriverError)
            assert erro.value.orig.sqlstate == "23514"
            if prova_id is not None:
                with pytest.raises(DBAPIError, match="imutável") as erro_prova, restaurado.begin_nested():
                    restaurado.execute(text("DELETE FROM candidato_legado_recaptura WHERE id=:id"), {"id": prova_id})
                assert isinstance(erro_prova.value.orig, DatabaseDriverError)
                assert erro_prova.value.orig.sqlstate == "P0001"
            novo_id = restaurado.scalar(
                text("INSERT INTO candidato_legado (numero,id_proposta) VALUES ('999002','111002') RETURNING id")
            )
            assert novo_id > restaurado.scalar(text("SELECT id FROM candidato_legado WHERE numero='999001'"))
            # Ensaio de restore não apaga ou modifica a origem/snapshot.
            assert resumo_dados(origem) == depois_na_origem
