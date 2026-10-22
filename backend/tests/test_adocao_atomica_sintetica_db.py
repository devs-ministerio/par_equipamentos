"""Uma transação para cópia, proteção, acesso e sequências; sem clone real."""

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from alembic import command
from scripts.preflight_clone_recuperacao import inventariar_acesso_clone
from scripts.transferencia_sintetica_recuperacao import adotar_sintetico_atomico, integridade_tabelas
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel
from tests.test_rollback_snapshot_recuperacao_db import preparar_historico_sintetico


@pytest.fixture
def bases_atomicas():
    with banco_descartavel() as (origem, co), banco_descartavel() as (destino, cd):
        command.upgrade(co, "b7f35c806e4a")
        decisao = preparar_historico_sintetico(origem, justificativa="Texto interno protegido no clone local")
        usuario = origem.scalar(text('SELECT min(id) FROM public."user"'))
        origem.execute(
            text("""UPDATE public."user" SET activation_token_hash='convite-sintetico',
            activation_expires_at=now()+interval '1 day' WHERE id=:id"""),
            {"id": usuario},
        )
        origem.execute(
            text("""INSERT INTO audit_log (user_id,entity_name,action,details)
            VALUES (:id,'user','update',jsonb_build_object('email','pessoa@privado.invalid'))"""),
            {"id": usuario},
        )
        origem.execute(
            text("""INSERT INTO refresh_token (user_id,token_hash,expires_at)
            SELECT :id,'hash-sintetico-' || n::text,now()+interval '1 day' FROM generate_series(1,502) n"""),
            {"id": usuario},
        )
        origem.execute(
            text("""INSERT INTO convenio (numero,convenente_nome,fora_escopo_equipamentos,valor_global)
            VALUES ('971252','Instituição sintética',true,123456789.123456789)""")
        )
        fonte = origem.scalar(
            text("""INSERT INTO fonte_captura (fonte,iniciado_em,finalizado_em,status)
            VALUES ('siconv_legado_recaptura',now(),now(),'ok') RETURNING id""")
        )
        origem.execute(
            text("""INSERT INTO candidato_legado_recaptura
            (candidato_id,captura_id,fonte_captura_id,hash_conteudo,situacao,valor_global,payload_oficial)
            SELECT candidato_id,captura_id,:fonte,:hash,'Prestação de Contas Concluída',123456789.123456789,
                jsonb_build_object('situacao','Prestação de Contas Concluída')
            FROM candidato_legado_decisao WHERE id=:id"""),
            {"id": decisao, "fonte": fonte, "hash": "a" * 64},
        )
        origem.execute(text("SELECT setval(pg_get_serial_sequence('candidato_legado','id'),500,true)"))
        origem.commit()
        command.upgrade(cd, "b7f35c806e4a")
        bootstrap = integridade_tabelas(destino)
        destino.commit()
        origem.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
        yield origem, destino, bootstrap


def test_adocao_so_commita_conjunto_protegido_e_acesso_invalido(bases_atomicas):
    origem, destino, bootstrap = bases_atomicas
    antes = integridade_tabelas(origem)
    esperado = adotar_sintetico_atomico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert not destino.in_transaction()  # Uma única transação concluída.
    assert integridade_tabelas(destino) == esperado
    assert integridade_tabelas(origem) == antes
    assert {t for t in esperado if esperado[t] != antes[t]} == {"user", "audit_log", "refresh_token"}
    assert {t: d.linhas for t, d in antes.items()} == {t: d.linhas for t, d in esperado.items()}
    assert destino.scalar(text("SELECT nextval(pg_get_serial_sequence('candidato_legado','id'))")) == 501
    assert destino.scalar(text("SELECT count(*) FROM public.\"user\" WHERE status <> 'inactive'")) == 0
    assert (
        destino.scalar(
            text("SELECT count(*) FROM refresh_token WHERE revoked_at IS NULL OR token_hash LIKE 'hash-sintetico-%'")
        )
        == 0
    )
    destino.commit()
    destino.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
    inventario = inventariar_acesso_clone(destino)
    assert inventario.identidades_fora_padrao_protegido == inventario.auditorias_sem_marcador_protecao == 0
    assert inventario.convites_com_segredo_ou_validade == inventario.sessoes_potencialmente_validas == 0
    assert destino.scalar(text("SELECT version_num FROM alembic_version")) == "b7f35c806e4a"


def test_falha_na_neutralizacao_reverte_inclusive_copy_ja_realizado(bases_atomicas):
    origem, destino, bootstrap = bases_atomicas
    antes = integridade_tabelas(origem)
    destino.execute(
        text("""CREATE FUNCTION falha_atomica() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'segredo-sintetico-no-driver'; END $$""")
    )
    destino.execute(
        text("""CREATE TRIGGER falha_atomica BEFORE UPDATE ON public."user"
        FOR EACH ROW EXECUTE FUNCTION falha_atomica()""")
    )
    destino.commit()
    with pytest.raises(ValueError, match="transação integral revertida") as erro:
        adotar_sintetico_atomico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert "segredo-sintetico-no-driver" not in str(erro.value)
    assert integridade_tabelas(destino) == bootstrap
    assert integridade_tabelas(origem) == antes


@pytest.mark.parametrize("campo", ["payload_oficial", "siconv_raw"])
def test_achado_pessoal_nao_tratado_bloqueia_antes_da_copia(bases_atomicas, campo):
    origem, destino, bootstrap = bases_atomicas
    origem.rollback()
    origem.execution_options(postgresql_readonly=False)
    if campo == "siconv_raw":
        origem.execute(text("UPDATE convenio SET siconv_raw=jsonb_build_object('email','pessoa@privado.invalid')"))
    else:
        # Prova antiga é imutável. Criar outra rodada, nunca UPDATE para
        # introduzir uma falha de privacidade em evidência existente.
        fonte = origem.scalar(
            text("""INSERT INTO fonte_captura (fonte,iniciado_em,finalizado_em,status)
            VALUES ('siconv_legado_recaptura',now(),now(),'ok') RETURNING id""")
        )
        origem.execute(
            text("""INSERT INTO candidato_legado_recaptura
            (candidato_id,captura_id,fonte_captura_id,hash_conteudo,situacao,valor_global,payload_oficial)
            SELECT candidato_id,captura_id,:fonte,:hash,situacao,valor_global,
                jsonb_build_object('email','pessoa@privado.invalid') FROM candidato_legado_recaptura"""),
            {"fonte": fonte, "hash": "b" * 64},
        )
    origem.commit()
    origem.execution_options(postgresql_readonly=True)
    antes = integridade_tabelas(origem)
    with pytest.raises(ValueError, match="adoção bloqueada"):
        adotar_sintetico_atomico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert integridade_tabelas(destino) == bootstrap
    assert integridade_tabelas(origem) == antes


def test_falha_tardia_de_sequencia_reverte_tambem_credenciais_e_copia(bases_atomicas):
    origem, destino, bootstrap = bases_atomicas
    origem.rollback()
    origem.execution_options(postgresql_readonly=False)
    origem.execute(text("ALTER SEQUENCE public.user_id_seq INCREMENT BY 2"))
    origem.commit()
    origem.execution_options(postgresql_readonly=True)
    antes = integridade_tabelas(origem)
    seq_antes = destino.execute(text("SELECT last_value,is_called FROM public.candidato_legado_id_seq")).one()
    destino.commit()
    with pytest.raises(ValueError, match="Sequência"):
        adotar_sintetico_atomico(origem=origem, destino=destino, bootstrap=bootstrap)
    assert integridade_tabelas(destino) == bootstrap
    assert destino.execute(text("SELECT last_value,is_called FROM public.candidato_legado_id_seq")).one() == seq_antes
    assert integridade_tabelas(origem) == antes


def test_prova_permanece_imutavel_depois_da_adocao(bases_atomicas):
    origem, destino, bootstrap = bases_atomicas
    adotar_sintetico_atomico(origem=origem, destino=destino, bootstrap=bootstrap)
    with pytest.raises(DBAPIError) as erro:
        destino.execute(text("UPDATE candidato_legado_recaptura SET payload_oficial='{}'::jsonb"))
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "P0001"
