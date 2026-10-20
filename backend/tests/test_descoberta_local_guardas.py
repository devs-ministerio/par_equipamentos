"""Guardas puras: nenhuma conexão ou chamada federal é autorizada aqui."""

import pytest

from scripts.descoberta_local_guardas import validar_ambiente
from scripts.descobrir_siconv_local import executar

STAGING = "postgresql://local@127.0.0.1/sigeo_homologacao_base_20261006_api_1234abcd"
TESTE = "postgresql://local@127.0.0.1/sigeo_test_clone_20261006"


def ambiente(url=STAGING):
    return {"DATABASE_URL": url, "DATABASE_URL_MIGRATION": url}


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://local@fonte.invalid/sigeo_homologacao_base_20261006_api_1234abcd",
        "postgresql://local@127.0.0.1/production",
        "postgresql://local@127.0.0.1/sigeo_homologacao_clone_20261006",
        "postgresql://local@127.0.0.1/sigeo_homologacao_base_20261006",
        STAGING + "?host=fonte.invalid",
        "sqlite:///local.db",
        TESTE,
    ],
)
def test_rejeita_remoto_clone_servido_base_e_teste_sem_opt_in(url):
    with pytest.raises(ValueError):
        validar_ambiente(ambiente(url))


def test_aceita_staging_exclusivo():
    assert validar_ambiente(ambiente()) == ("127.0.0.1", 5432, "sigeo_homologacao_base_20261006_api_1234abcd")


def test_aceita_teste_apenas_com_tres_urls_explicitamente_coerentes():
    env = ambiente(TESTE)
    env["TEST_DATABASE_URL"] = TESTE
    assert validar_ambiente(env) == ("127.0.0.1", 5432, "sigeo_test_clone_20261006")


@pytest.mark.parametrize("chave", ["DATABASE_URL", "DATABASE_URL_MIGRATION"])
def test_urls_ausentes_nao_herdam_configuracao(chave):
    env = ambiente()
    del env[chave]
    with pytest.raises(ValueError):
        validar_ambiente(env)


@pytest.mark.parametrize("chave", ["DATABASE_URL_MIGRATION", "TEST_DATABASE_URL"])
def test_urls_divergentes_rejeitadas(chave):
    env = ambiente(TESTE)
    env["TEST_DATABASE_URL"] = TESTE
    env[chave] = TESTE.replace("20261006", "20261007")
    with pytest.raises(ValueError, match="divergentes"):
        validar_ambiente(env)


@pytest.mark.parametrize("chave", ["PGHOST", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"])
def test_recusa_opcoes_herdadas_do_driver(chave):
    env = ambiente()
    env[chave] = "valor-sintetico"
    with pytest.raises(ValueError, match="PG herdadas"):
        validar_ambiente(env)


@pytest.mark.parametrize("limite", [0, 1001, -1, True, "10"])
def test_limite_invalido_rejeitado_antes_de_carregar_app(limite):
    with pytest.raises(ValueError, match="Limite local"):
        executar(limite=limite)


@pytest.mark.parametrize("modo", [None, "false", 1])
def test_baseline_precisa_de_booleano_explicito(modo):
    with pytest.raises(ValueError, match="booleano"):
        executar(baseline_silenciosa=modo)
