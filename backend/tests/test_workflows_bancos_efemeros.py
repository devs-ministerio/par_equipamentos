"""Guardas dos destinos declarados; não substitui actionlint do CI."""

import os
import re
import subprocess
from pathlib import Path

import pytest
from sqlalchemy.engine import make_url

from scripts.descoberta_local_guardas import validar_ambiente

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"


@pytest.mark.parametrize("nome", ["backend_ci.yml", "espelho_homologacao.yml"])
def test_urls_de_testes_passam_guardas_e_correspondem_ao_cluster_loopback(nome):
    # Arrange: campos escalares literais destes workflows, não um parser YAML.
    texto = (WORKFLOWS / nome).read_text()
    campos = dict(re.findall(r"^\s+(DATABASE_URL|DATABASE_URL_MIGRATION|TEST_DATABASE_URL): (\S+)$", texto, re.M))
    banco = re.search(r"^\s+POSTGRES_DB: (\S+)$", texto, re.M)
    assert banco is not None
    # Act: a mesma guarda usada no ensaio local, sem enfraquecer nomes/destinos.
    destino = validar_ambiente(campos)
    # Assert
    assert destino == ("127.0.0.1", 5433, banco[1])
    assert all(make_url(url).database == banco[1] for url in campos.values())
    assert "bash ../.github/scripts/iniciar-postgres-ci.sh" in texto
    assert "services:" not in texto
    for chave in ("MAIL_API_URL", "MAIL_API_SECRET", "PORTAL_TRANSPARENCIA_API_KEY"):
        assert re.search(rf'^\s+{chave}: ""$', texto, re.M)
    assert re.search(r'^\s+NEW_RELIC_ENABLED: "false"$', texto, re.M)


def test_ensaio_nao_habilita_coleta_remota_deploy_ou_recorrencia():
    # Arrange / Act
    texto = (WORKFLOWS / "espelho_homologacao.yml").read_text()
    # Assert
    assert "workflow_dispatch: {}" in texto and "refs/heads/homologacao" in texto
    assert "schedule:" not in texto and "${{ secrets." not in texto
    assert "python -m scripts.job_descoberta_siconv" not in texto


def test_relatorios_backend_sao_publicados_do_diretorio_que_os_gera():
    # Arrange / Act
    texto = (WORKFLOWS / "backend_ci.yml").read_text()
    # Assert: defaults.run não altera o diretório do action upload-artifact.
    assert "working-directory: backend" in texto
    assert "--cov-report=json:coverage.json" in texto and "--cov-report=xml:coverage.xml" in texto
    assert "backend/coverage.json" in texto and "backend/coverage.xml" in texto


def test_relatorios_frontend_sao_publicados_do_diretorio_que_os_gera():
    # Arrange / Act
    texto = (WORKFLOWS / "frontend_ci.yml").read_text()
    # Assert: upload-artifact usa a raiz, não defaults.run.working-directory.
    assert "working-directory: frontend" in texto
    assert "frontend/coverage/coverage-final.json" in texto
    assert "frontend/coverage/lcov.info" in texto


@pytest.mark.parametrize("github_actions,ambiente", [("false", "github-hosted"), ("true", "self-hosted")])
def test_bootstrap_postgres_recusa_maquina_local_ou_runner_persistente(tmp_path, github_actions, ambiente):
    # Arrange: nem credencial nem diretório do cluster devem ser criados fora do CI.
    script = WORKFLOWS.parent / "scripts" / "iniciar-postgres-ci.sh"
    ambiente_teste = {
        "PATH": os.defpath,
        "GITHUB_ACTIONS": github_actions,
        "RUNNER_ENVIRONMENT": ambiente,
        "RUNNER_TEMP": str(tmp_path),
    }
    # Act: executa a guarda real, não mocka shell nem utilitário de banco.
    resultado = subprocess.run(["bash", str(script)], env=ambiente_teste, capture_output=True, text=True, check=False)
    # Assert
    assert resultado.returncode == 1
    assert "exige runner Linux hospedado e descartável" in resultado.stderr
    assert list(tmp_path.iterdir()) == []
