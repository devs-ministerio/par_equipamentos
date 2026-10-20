"""Proteção antes do INSERT, sem alterar auditoria/identidade da origem."""

import pytest
from sqlalchemy import text

from scripts.neutralizar_acesso_sintetico import neutralizar_acesso_sintetico
from scripts.preflight_clone_recuperacao import inventariar_acesso_clone
from scripts.transferencia_sintetica_recuperacao import integridade_tabelas, transferir_sintetico
from tests.test_transferencia_sintetica_recuperacao_db import bancos_transferencia as bancos_transferencia


@pytest.fixture
def bases_privacidade(bancos_transferencia):
    origem, destino, bootstrap, decisao, _ = bancos_transferencia
    # Dados exclusivamente sintéticos na origem descartável. Nunca inserir
    # dados de teste no clone sobrevivente para viabilizar este ensaio.
    origem.rollback()
    origem.execution_options(postgresql_readonly=False)
    origem.execute(
        text("""UPDATE public."user" SET name='Pessoa de Teste ' || id::text,
        email='pessoa-' || id::text || '@privado.invalid' """)
    )
    usuario = origem.scalar(text('SELECT min(id) FROM public."user"'))
    origem.execute(
        text("""INSERT INTO audit_log (user_id,entity_name,entity_id,action,details)
        VALUES (:id,'user',:id,'update',jsonb_build_object('email','pessoa@privado.invalid','ip','192.0.2.1')),
        (:id,'user',:id,'update',NULL)"""),
        {"id": usuario},
    )
    origem.commit()
    origem.execution_options(postgresql_readonly=True)
    yield origem, destino, bootstrap, decisao


def test_identidade_e_auditoria_protegidas_antes_do_copy_preservam_atores(bases_privacidade):
    origem, destino, bootstrap, decisao = bases_privacidade
    original = integridade_tabelas(origem)
    esperado = integridade_tabelas(origem, proteger_identidades_auditoria=True)
    assert {t for t in original if original[t] != esperado[t]} == {"user", "audit_log"}
    # Demonstra que conteúdo privado nunca chega à tabela de destino, nem
    # temporariamente: triggers de INSERT inspecionam as linhas recebidas.
    destino.execute(
        text("""CREATE FUNCTION exigir_identidade_protegida() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.name <> 'Usuário local ' || NEW.id::text
        OR NEW.email <> 'usuario-local-' || NEW.id::text || '@example.com'
        THEN RAISE EXCEPTION 'identidade não protegida'; END IF; RETURN NEW; END $$""")
    )
    destino.execute(
        text("""CREATE TRIGGER exigir_identidade_protegida BEFORE INSERT ON public."user"
        FOR EACH ROW EXECUTE FUNCTION exigir_identidade_protegida()""")
    )
    destino.execute(
        text("""CREATE FUNCTION exigir_auditoria_protegida() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.details IS DISTINCT FROM jsonb_build_object('protegido_no_clone_local',true)
        THEN RAISE EXCEPTION 'auditoria não protegida'; END IF; RETURN NEW; END $$""")
    )
    destino.execute(
        text("""CREATE TRIGGER exigir_auditoria_protegida BEFORE INSERT ON public.audit_log
        FOR EACH ROW EXECUTE FUNCTION exigir_auditoria_protegida()""")
    )
    destino.commit()
    assert (
        transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap, proteger_identidades_auditoria=True)
        == esperado
        == integridade_tabelas(destino)
    )
    assert integridade_tabelas(origem) == original
    for tabela in original:
        assert esperado[tabela].linhas == original[tabela].linhas
    assert (
        destino.execute(
            text("SELECT id,user_id,entity_name,entity_id,action,created_at FROM audit_log ORDER BY id")
        ).all()
        == origem.execute(
            text("SELECT id,user_id,entity_name,entity_id,action,created_at FROM audit_log ORDER BY id")
        ).all()
    )
    assert destino.scalar(
        text("SELECT usuario_id FROM candidato_legado_decisao WHERE id=:id"), {"id": decisao}
    ) == origem.scalar(text("SELECT usuario_id FROM candidato_legado_decisao WHERE id=:id"), {"id": decisao})
    destino.commit()
    # As mudanças posteriores de acesso não alteram o manifesto privado já
    # protegido, decisões ou provas. Chamada permanece apenas sintética.
    neutralizar_acesso_sintetico(destino=destino, esperado=esperado)
    destino.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
    observado = inventariar_acesso_clone(destino)
    assert observado.identidades_fora_padrao_protegido == observado.auditorias_sem_marcador_protecao == 0
    assert integridade_tabelas(destino)["audit_log"] == esperado["audit_log"]
    assert integridade_tabelas(origem) == original


def test_modo_protegido_e_idempotente_no_manifesto(bases_privacidade):
    origem, destino, bootstrap, _ = bases_privacidade
    transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap, proteger_identidades_auditoria=True)
    assert integridade_tabelas(destino) == integridade_tabelas(destino, proteger_identidades_auditoria=True)


def test_erro_em_auditoria_reverte_tambem_usuarios_ja_protegidos(bases_privacidade):
    origem, destino, bootstrap, _ = bases_privacidade
    original = integridade_tabelas(origem)
    destino.execute(
        text("""CREATE FUNCTION falhar_auditoria_protegida() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'falha sintética'; END $$""")
    )
    destino.execute(
        text("""CREATE TRIGGER falhar_auditoria_protegida BEFORE INSERT ON public.audit_log
        FOR EACH ROW EXECUTE FUNCTION falhar_auditoria_protegida()""")
    )
    destino.commit()
    with pytest.raises(ValueError, match="transação do destino revertida") as erro:
        transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap, proteger_identidades_auditoria=True)
    assert "COPY" not in str(erro.value) and "falha sintética" not in str(erro.value)
    assert integridade_tabelas(destino) == bootstrap
    assert integridade_tabelas(origem) == original
