"""Rejeições antes de qualquer conexão; não enfraquece guardas existentes."""

import subprocess
import sys

import pytest

from scripts.job_recaptura_legado_local import executar
from scripts.recaptura_legado_guardas import (
    conferir_conexao_carregada,
    validar_ambiente_recaptura,
    validar_configuracao_coleta,
)
from tests.test_descoberta_local_guardas import STAGING, TESTE, ambiente


@pytest.mark.parametrize("identificador", [0, -1, True, "1", None])
def test_id_invalido_bloqueia_antes_do_ambiente(identificador):
    with pytest.raises(ValueError, match="identificador positivo"):
        executar(candidato_id=identificador)


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://local@remoto.invalid/sigeo_homologacao_clone_20261017",
        "postgresql://local@127.0.0.1/production",
        "postgresql://local@127.0.0.1/sigeo_homologacao_clone_20261017?host=remoto.invalid",
        "sqlite:///local.db",
    ],
)
def test_ready_nao_permite_remoto_redirecionamento_ou_outro_banco(url):
    with pytest.raises(ValueError):
        validar_ambiente_recaptura({"DATABASE_URL": url, "SIGEO_LOCAL_READY": "true"})


def test_ready_nao_permite_driver_env_herdado():
    with pytest.raises(ValueError, match="PG herdadas"):
        validar_ambiente_recaptura({"SIGEO_LOCAL_READY": "true", "PGSERVICE": "sintetico"})


def test_staging_e_teste_continuam_exigindo_destinos_explicitos():
    assert validar_ambiente_recaptura(ambiente(STAGING))[2] == "sigeo_homologacao_base_20261006_api_1234abcd"
    env = {**ambiente(TESTE), "TEST_DATABASE_URL": TESTE}
    assert validar_ambiente_recaptura(env)[2] == "sigeo_test_clone_20261006"
    with pytest.raises(ValueError):
        validar_ambiente_recaptura({})


@pytest.mark.parametrize("ausente", ["JWT_SECRET", "PORTAL_TRANSPARENCIA_API_KEY", "NEW_RELIC_ENABLED"])
def test_worker_nao_herda_segredos_ou_telemetria_do_dotenv(ausente):
    env = {"JWT_SECRET": "s" * 48, "PORTAL_TRANSPARENCIA_API_KEY": "chave-sintetica", "NEW_RELIC_ENABLED": "false"}
    validar_configuracao_coleta(env)
    del env[ausente]
    with pytest.raises(ValueError):
        validar_configuracao_coleta(env)


@pytest.mark.parametrize("url", [STAGING.replace("local@", "dono@"), STAGING + "?host=remoto.invalid", TESTE])
def test_engine_precarregada_nao_pode_trocar_banco_ou_role(url):
    with pytest.raises(ValueError):
        conferir_conexao_carregada(url, ambiente(STAGING))


def test_normalizacao_do_driver_nao_muda_destino_autorizado():
    conferir_conexao_carregada(STAGING.replace("postgresql:", "postgresql+psycopg:"), ambiente(STAGING))


def test_cli_rejeita_remoto_sem_importar_config_do_app_ou_expor_segredos():
    chave = "chave-sintetica-nao-exibir"
    resultado = subprocess.run(
        [sys.executable, "-m", "scripts.job_recaptura_legado_local", "--candidato-id", "1"],
        env={
            "DATABASE_URL": "postgresql://local@remoto.invalid/production",
            "DATABASE_URL_MIGRATION": "postgresql://local@remoto.invalid/production",
            "JWT_SECRET": "s" * 48,
            "PORTAL_TRANSPARENCIA_API_KEY": chave,
            "NEW_RELIC_ENABLED": "false",
        },
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert resultado.returncode == 1 and resultado.stderr == ""
    assert "Recaptura não publicada" in resultado.stdout
    assert chave not in resultado.stdout and "remoto.invalid" not in resultado.stdout


def test_cli_help_nao_exige_segredos_nem_abre_banco():
    resultado = subprocess.run(
        [sys.executable, "-m", "scripts.job_recaptura_legado_local", "--help"],
        env={},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert resultado.returncode == 0 and "--candidato-id" in resultado.stdout and resultado.stderr == ""
