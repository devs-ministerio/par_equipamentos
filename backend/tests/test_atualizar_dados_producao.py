"""Guardas do executor recusam destino ou configuração incompatíveis."""

import pytest

from scripts.atualizar_dados_producao import TAREFAS, validar_ambiente


@pytest.fixture
def ambiente_batch(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return {
        "GITHUB_ACTIONS": "true",
        "ATUALIZACOES_PRODUCAO": "true",
        "DATABASE_URL": "postgresql+psycopg://sigeo_runtime:senha-sintetica@exemplo.neon.tech/sigeo",
    }


@pytest.mark.parametrize(
    ("campo", "valor", "mensagem"),
    [
        ("GITHUB_ACTIONS", "false", "exclusivo"),
        ("ATUALIZACOES_PRODUCAO", "false", "exclusivo"),
        ("DATABASE_URL_MIGRATION", "presente", "migração/teste"),
        ("TEST_DATABASE_URL", "presente", "migração/teste"),
        ("PGHOST", "herdado", "PG"),
        ("DATABASE_URL", "postgresql://postgres:teste@exemplo.neon.tech/sigeo", "sigeo_runtime"),
        ("DATABASE_URL", "postgresql://sigeo_runtime:teste@localhost/sigeo", "não reconhecido"),
    ],
)
def test_executor_recusa_configuracao_incompativel(ambiente_batch, campo, valor, mensagem):
    # Arrange
    ambiente_batch[campo] = valor
    # Act / Assert
    with pytest.raises(ValueError, match=mensagem):
        validar_ambiente(ambiente_batch)


def test_executor_recusa_dotenv_implicito(ambiente_batch, tmp_path):
    # Arrange
    (tmp_path / ".env").write_text("JWT_SECRET=sintetico")
    # Act / Assert
    with pytest.raises(ValueError, match="sem arquivo .env"):
        validar_ambiente(ambiente_batch)


def test_executor_inclui_descoberta_ausente_no_workflow_antigo():
    # Arrange / Act
    modulo, fonte = TAREFAS["descoberta-siconv"]
    # Assert
    assert modulo == "scripts.job_descoberta_siconv"
    assert fonte == "siconv_descoberta"
