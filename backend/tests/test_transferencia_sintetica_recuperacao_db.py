"""Adoção de dados em destino realmente migrado, só bancos descartáveis."""

import pytest
from psycopg import Error as DatabaseDriverError
from psycopg import Error as ErroPsycopg
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from alembic import command
from scripts.transferencia_sintetica_recuperacao import integridade_tabelas, transferir_sintetico
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel
from tests.test_rollback_snapshot_recuperacao_db import preparar_historico_sintetico


@pytest.fixture
def bancos_transferencia(request):
    revisao = getattr(request, "param", "b7f35c806e4a")
    with banco_descartavel() as (origem, config_origem), banco_descartavel() as (destino, config_destino):
        command.upgrade(config_origem, revisao)
        decisao = preparar_historico_sintetico(origem)
        origem.execute(
            text(
                "INSERT INTO convenio (numero,convenente_nome,fora_escopo_equipamentos,valor_global) VALUES ('971252','Instituição sintética',true,1234567890.123456789)"
            )
        )
        fonte = origem.scalar(
            text(
                "INSERT INTO fonte_captura (fonte,iniciado_em,finalizado_em,status) VALUES ('siconv_oficial',now(),now(),'ok') RETURNING id"
            )
        )
        origem.execute(
            text("""
            INSERT INTO candidato_legado_recaptura
                (candidato_id,captura_id,fonte_captura_id,hash_conteudo,situacao,valor_global,payload_oficial)
            SELECT candidato_id,captura_id,:fonte,:hash,'Prestação de Contas Concluída',1234567890.123456789,CAST(:payload AS jsonb)
            FROM candidato_legado_decisao WHERE id=:id
        """),
            {
                "fonte": fonte,
                "hash": "b" * 64,
                "id": decisao,
                "payload": '{"texto":"Linha 1\\nLinha 2 — acentuação", "valor":123.123456789}',
            },
        )
        instrumento = origem.scalar(
            text(
                "INSERT INTO instrumento_equipamento (nr_convenio,nome_convenente) VALUES ('999001','Instituição sintética') RETURNING id"
            )
        )
        # Autorreferência para linha posterior, sem desabilitar FK na origem.
        origem.execute(
            text("""
            INSERT INTO acao_monitoramento (id,instrumento_id,descricao,substituido_por_id)
            OVERRIDING SYSTEM VALUE VALUES (1,:id,'Ação antiga',2),(2,:id,'Ação substituta',NULL)
        """),
            {"id": instrumento},
        )
        if revisao == "b7f35c806e4a":
            origem.execute(text("INSERT INTO candidato_legado (numero,id_proposta) VALUES ('7ATEST','111003')"))
        origem.execute(text("SELECT setval(pg_get_serial_sequence('candidato_legado','id'),500,true)"))
        for familia in ("TOMOGRAFO", "RESSONANCIA"):
            competencia = origem.scalar(
                text("INSERT INTO competency (label,equipment_family) VALUES ('2026-10',:familia) RETURNING id"),
                {"familia": familia},
            )
            execucao = origem.scalar(
                text("""
                INSERT INTO execution (competency_id,version,mode,status,config_chave_macrorregiao,config_denominador_oferta)
                VALUES (:id,1,'automatic','published','ibge_municipio','qt_existente_sus') RETURNING id
            """),
                {"id": competencia},
            )
            origem.execute(
                text("UPDATE competency SET published_execution_id=:execucao WHERE id=:id"),
                {"execucao": execucao, "id": competencia},
            )
        origem.commit()
        command.upgrade(config_destino, "b7f35c806e4a")
        bootstrap = integridade_tabelas(destino)
        destino.commit()
        origem.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
        yield origem, destino, bootstrap, decisao, revisao


@pytest.mark.parametrize("bancos_transferencia", ["a6e24b7f5d39", "b7f35c806e4a"], indirect=True)
def test_transfere_todas_tabelas_preserva_revisoes_ciclo_auditoria_e_sequencias(bancos_transferencia):
    origem, destino, bootstrap, decisao, revisao = bancos_transferencia
    antes = integridade_tabelas(origem)
    resultado = transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert resultado == integridade_tabelas(destino) == antes
    assert integridade_tabelas(origem) == antes
    assert origem.scalar(text("SHOW transaction_read_only")) == "on"
    assert origem.scalar(text("SELECT version_num FROM alembic_version")) == revisao
    assert destino.scalar(text("SELECT version_num FROM alembic_version")) == "b7f35c806e4a"
    assert destino.scalar(
        text("SELECT ultima_captura_id FROM candidato_legado WHERE numero='999001'")
    ) == destino.scalar(text("SELECT id FROM candidato_legado_captura"))
    assert list(destino.execute(text("SELECT id,substituido_por_id FROM acao_monitoramento ORDER BY id"))) == [
        (1, 2),
        (2, None),
    ]
    assert destino.scalar(text("SELECT fora_escopo_equipamentos FROM convenio")) is True
    assert list(
        destino.execute(
            text(
                "SELECT c.equipment_family,e.competency_id=c.id FROM competency c JOIN execution e ON e.id=c.published_execution_id ORDER BY c.equipment_family"
            )
        )
    ) == [("RESSONANCIA", True), ("TOMOGRAFO", True)]
    # Triggers continuaram ativos durante e depois da transferência.
    for tabela, codigo in (("candidato_legado_decisao", "23514"), ("candidato_legado_recaptura", "P0001")):
        with pytest.raises(DBAPIError, match="imutável") as erro, destino.begin_nested():
            destino.execute(text(f'DELETE FROM "{tabela}" WHERE id=:id'), {"id": decisao})
        assert isinstance(erro.value.orig, DatabaseDriverError)
        assert erro.value.orig.sqlstate == codigo
    novo = destino.scalar(
        text("INSERT INTO candidato_legado (numero,id_proposta) VALUES ('999002','111002') RETURNING id")
    )
    assert novo == 501  # Preserva high-water mark, não apenas max(id) das linhas.
    destino.rollback()


def test_destino_modificado_e_recusado_antes_de_substituir_bootstrap(bancos_transferencia):
    origem, destino, bootstrap, _, _ = bancos_transferencia
    destino.execute(text("INSERT INTO convenio (numero,convenente_nome) VALUES ('999003','Dado anterior sintético')"))
    destino.commit()
    antes = integridade_tabelas(destino)
    destino.commit()
    with pytest.raises(ValueError, match="Destino mudou"):
        transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert integridade_tabelas(destino) == antes


def test_origem_sem_read_only_e_recusada_sem_alterar_destino(bancos_transferencia):
    origem, destino, bootstrap, _, _ = bancos_transferencia
    origem.execution_options(postgresql_readonly=False)
    with pytest.raises(ValueError, match="snapshot"):
        transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert integridade_tabelas(destino) == bootstrap


def test_falha_real_de_constraint_reverte_copia_e_bootstrap(bancos_transferencia):
    origem, destino, bootstrap, _, _ = bancos_transferencia
    destino.execute(
        text("ALTER TABLE convenio ADD CONSTRAINT falha_sintetica_transferencia CHECK (numero <> '971252')")
    )
    destino.commit()
    antes = integridade_tabelas(origem)
    with pytest.raises(ErroPsycopg) as erro:
        transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert erro.value.sqlstate == "23514"
    assert integridade_tabelas(destino) == bootstrap
    assert integridade_tabelas(origem) == antes


def test_falha_tardia_reverte_dados_e_restart_de_sequencias(bancos_transferencia):
    origem, destino, bootstrap, _, _ = bancos_transferencia
    origem.execution_options(postgresql_readonly=False)
    origem.execute(text("ALTER SEQUENCE public.user_id_seq INCREMENT BY 2"))
    origem.commit()
    origem.execution_options(postgresql_readonly=True)
    sequencia_antes = destino.execute(text("SELECT last_value,is_called FROM candidato_legado_id_seq")).one()
    destino.commit()
    with pytest.raises(ValueError, match="Sequência fora do contrato"):
        transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert integridade_tabelas(destino) == bootstrap
    assert destino.execute(text("SELECT last_value,is_called FROM candidato_legado_id_seq")).one() == sequencia_antes


def test_reexecucao_nao_sobrescreve_destino_ja_adotado(bancos_transferencia):
    origem, destino, bootstrap, _, _ = bancos_transferencia
    transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap)
    antes = integridade_tabelas(destino)
    destino.commit()
    with pytest.raises(ValueError, match="Destino mudou"):
        transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert integridade_tabelas(destino) == antes


def test_origem_em_revisao_nao_validada_nao_altera_destino():
    with banco_descartavel() as (origem, config_origem), banco_descartavel() as (destino, config_destino):
        # Revisão real e existente, não stamp ou revisão inventada.
        command.upgrade(config_origem, "95d13a6e4c28")
        command.upgrade(config_destino, "b7f35c806e4a")
        bootstrap = integridade_tabelas(destino)
        destino.commit()
        origem.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
        with pytest.raises(ValueError, match="Revisão da origem"):
            transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap)
        assert integridade_tabelas(destino) == bootstrap
