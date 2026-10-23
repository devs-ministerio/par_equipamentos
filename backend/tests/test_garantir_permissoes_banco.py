"""Dono e permissões do schema public: a falha de 23/10/2026 (tabela nova sem leitura para o backup)."""

import pytest
from sqlalchemy import text

from app.db.base import engine
from scripts.garantir_permissoes_banco import (
    Pendencias,
    corrigir,
    listar_pendencias,
    main,
    usuario_atual,
)


def test_pendencias_vazias_e_formatacao():
    assert Pendencias().vazio()
    p = Pendencias(fora_do_dono=["tabela x (dono neondb_owner)"], sem_permissao={"sigeo_backup": ["x (tabela)"]})
    assert not p.vazio()
    assert p.linhas() == [
        "Fora do dono atual: tabela x (dono neondb_owner)",
        "Sem permissão para sigeo_backup: x (tabela)",
    ]


@pytest.mark.db
def test_usuario_diferente_do_esperado_falha_com_mensagem(capsys):
    # Given: o usuário do banco de teste não é o role de migração de produção
    with engine.connect() as conexao:
        assert usuario_atual(conexao) != "sigeo_migration"
    # When / Then
    assert main(["--so-usuario"]) == 1
    assert "DATABASE_URL_MIGRATION" in capsys.readouterr().err


@pytest.mark.db
def test_sem_as_roles_da_aplicacao_a_conferencia_e_ignorada():
    with engine.connect() as conexao:
        existentes = conexao.execute(
            text("SELECT count(*) FROM pg_roles WHERE rolname IN ('sigeo_runtime', 'sigeo_backup')")
        ).scalar_one()
        if existentes:
            pytest.skip("o cluster de teste já tem roles sigeo_*")
        pendencias = listar_pendencias(conexao)
    assert pendencias.roles_ausentes == ["sigeo_backup", "sigeo_runtime"]
    assert pendencias.sem_permissao == {}


@pytest.mark.db
def test_tabela_nova_sem_permissao_e_detectada_e_corrigida_dentro_de_uma_transacao():
    with engine.connect() as conexao:
        transacao = conexao.begin()
        try:
            try:
                conexao.execute(text("CREATE ROLE sigeo_backup NOLOGIN"))
                conexao.execute(text("CREATE ROLE sigeo_runtime NOLOGIN"))
            except Exception:
                pytest.skip("sem permissão para criar roles ou roles sigeo_* já existentes")
            conexao.execute(text("CREATE TABLE tabela_sem_permissao_pytest (id int)"))
            # Given: tabela criada depois, sem concessão para as roles
            antes = listar_pendencias(conexao)
            assert any("tabela_sem_permissao_pytest" in i for i in antes.sem_permissao["sigeo_backup"])
            assert any("tabela_sem_permissao_pytest" in i for i in antes.sem_permissao["sigeo_runtime"])
            # When
            corrigir(conexao)
            depois = listar_pendencias(conexao)
            # Then
            assert not any("tabela_sem_permissao_pytest" in i for i in depois.sem_permissao["sigeo_backup"])
            assert not any("tabela_sem_permissao_pytest" in i for i in depois.sem_permissao["sigeo_runtime"])
        finally:
            transacao.rollback()
