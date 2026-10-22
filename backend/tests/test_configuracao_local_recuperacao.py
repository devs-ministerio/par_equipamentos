"""Credenciais nunca sobrescrevem arquivos nem escapam da pasta privada."""

from pathlib import Path

import pytest
from dotenv import dotenv_values

from scripts.configuracao_local_recuperacao import gerar_senhas_locais, gravar_configuracao_privada
from scripts.servir_local_recuperacao import ambiente_do_processo, conferir_ambiente_servido


def pasta_privada(tmp_path: Path) -> Path:
    pasta = tmp_path.resolve() / "privado"
    pasta.mkdir(mode=0o700)
    return pasta


def test_arquivo_novo_0600_roundtrip_e_sem_overwrite(tmp_path):
    pasta = pasta_privada(tmp_path)
    alvo = pasta / ".env.local"
    gravar_configuracao_privada(alvo, {"JWT_SECRET": "segredo-sintetico", "MAIL_API_URL": ""})
    assert alvo.stat().st_mode & 0o777 == 0o600
    assert dotenv_values(alvo) == {"JWT_SECRET": "segredo-sintetico", "MAIL_API_URL": ""}
    with pytest.raises(FileExistsError):
        gravar_configuracao_privada(alvo, {"JWT_SECRET": "nao-sobrescrever"})
    assert dotenv_values(alvo)["JWT_SECRET"] == "segredo-sintetico"


def test_pasta_publica_nao_recebe_segredo(tmp_path):
    pasta = pasta_privada(tmp_path)
    pasta.chmod(0o755)
    with pytest.raises(ValueError, match="0700"):
        gravar_configuracao_privada(pasta / ".env.local", {"JWT_SECRET": "sintetico"})
    assert not (pasta / ".env.local").exists()


def test_symlinks_nao_redirecionam_configuracao(tmp_path):
    pasta = pasta_privada(tmp_path)
    referencia = tmp_path.resolve() / "atalho"
    referencia.symlink_to(pasta, target_is_directory=True)
    with pytest.raises(ValueError, match="symlink"):
        gravar_configuracao_privada(referencia / ".env.local", {"JWT_SECRET": "sintetico"})
    outro = pasta / "original"
    outro.write_text("sintetico", encoding="utf-8")
    (pasta / ".env.local").symlink_to(outro)
    with pytest.raises(OSError):
        gravar_configuracao_privada(pasta / ".env.local", {"JWT_SECRET": "nao-escrever"})
    assert outro.read_text(encoding="utf-8") == "sintetico"


@pytest.mark.parametrize(
    "chave,valor",
    [("JWT_SECRET", "x\nOUTRO=y"), ("INVALIDO=CHAVE", "x"), ("JWT_SECRET", "x'"), ("JWT_SECRET", "x\x00")],
)
def test_recusa_injecao_dotenv_antes_de_criar_arquivo(tmp_path, chave, valor):
    pasta = pasta_privada(tmp_path)
    with pytest.raises(ValueError):
        gravar_configuracao_privada(pasta / ".env.local", {chave: valor})
    assert not (pasta / ".env.local").exists()


def test_senhas_sao_independentes_fortes_e_repr_protegida():
    senhas = gerar_senhas_locais()
    assert set(senhas) == {"admin", "gestor", "colaborador", "leitor"}
    valores = [senha.get_secret_value() for senha in senhas.values()]
    assert len(set(valores)) == 4 and all(len(senha) >= 32 for senha in valores)
    assert all(senha not in repr(senhas) for senha in valores)


def test_processo_api_nao_herda_dono_senhas_de_teste_ou_segredos_extras():
    ambiente = {
        "PATH": "/usr/bin",
        "DATABASE_URL": "runtime-sintetico",
        "DATABASE_URL_MIGRATION": "dono-sintetico",
        "TEST_DATABASE_URL": "teste-sintetico",
        "JWT_SECRET": "jwt-sintetico",
        "MAIL_API_SECRET": "caixa-sintetica",
        "SIGEO_LOCAL_ADMIN_PASSWORD": "senha-sintetica",
        "PGPASSWORD": "dono-sintetico",
        "AWS_SECRET_ACCESS_KEY": "nao-herdar",
        "PORTAL_TRANSPARENCIA_API_KEY": "nao-herdar",
        "NEW_RELIC_ENABLED": "true",
    }
    api = ambiente_do_processo(ambiente)
    assert api["DATABASE_URL"] == "runtime-sintetico" and api["DATABASE_URL_MIGRATION"] == ""
    assert api["PORTAL_TRANSPARENCIA_API_KEY"] == "" and api["NEW_RELIC_ENABLED"] == "false"
    assert api["JWT_SECRET"] == "jwt-sintetico"
    assert not {"PGPASSWORD", "TEST_DATABASE_URL", "SIGEO_LOCAL_ADMIN_PASSWORD", "AWS_SECRET_ACCESS_KEY"} & api.keys()
    caixa = ambiente_do_processo(ambiente, caixa=True)
    assert caixa == {"PATH": "/usr/bin", "MAIL_API_SECRET": "caixa-sintetica", "NEW_RELIC_ENABLED": "false"}


@pytest.mark.parametrize(
    "ambiente",
    [
        {},
        {"SIGEO_LOCAL_READY": "false"},
        {
            "SIGEO_LOCAL_READY": "true",
            "DATABASE_URL": "postgresql+psycopg://dono@127.0.0.1/sigeo_homologacao_clone_20261017",
        },
    ],
)
def test_servidor_recusa_configuracao_incompleta_ou_dono_antes_de_conectar(ambiente):
    with pytest.raises(ValueError):
        conferir_ambiente_servido(ambiente)
