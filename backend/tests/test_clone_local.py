import pytest

from scripts.clonar_banco_local import ambiente_pg, validar_destino
from scripts.proteger_clone_local import ProtecaoTexto


@pytest.mark.parametrize(
    "host,nome",
    [
        ("produção.invalid", "sigeo_homologacao_base_20261006"),
        ("127.0.0.1", "postgres"),
        ("127.0.0.1", "sigeo_homologacao_demo"),
    ],
)
def test_destino_fora_do_escopo_recusado(host, nome):
    with pytest.raises(ValueError):
        validar_destino(host, nome)


def test_destino_novo_loopback_aceito():
    validar_destino("127.0.0.1", "sigeo_homologacao_clone_20261006")


def test_credenciais_somente_no_ambiente_pg():
    env = ambiente_pg("postgresql://local:segredo@127.0.0.1:5432/banco?sslmode=require")
    assert env["PGPASSWORD"] == "segredo"
    assert env["PGDATABASE"] == "banco"
    assert env["PGSSLMODE"] == "require"


def test_protecao_preserva_valores_datas_identificadores():
    protecao = ProtecaoTexto(["Pessoa Exemplo"])
    dados = {
        "nr_convenio": "825374",
        "valor": "25247812630",
        "data": "2026-10-06",
        "email": "pessoa@invalid.test",
        "responsavel": "Pessoa Exemplo",
        "quantidade": 9,
    }
    resultado = protecao.payload(dados)
    assert isinstance(resultado, dict)
    assert resultado["nr_convenio"] == "825374"
    assert resultado["valor"] == "25247812630"
    assert resultado["data"] == "2026-10-06"
    assert resultado["quantidade"] == 9
    assert resultado["email"] != dados["email"]
    assert resultado["responsavel"] != dados["responsavel"]


def test_texto_interno_protegido_e_pseudonimo_consistente():
    protecao = ProtecaoTexto(["Pessoa Exemplo"])
    texto = protecao.texto("Pessoa Exemplo pessoa@invalid.test (61) 99999-0000 123.456.789-00")
    assert "Pessoa Exemplo" not in texto
    assert "pessoa@invalid.test" not in texto
    assert "99999-0000" not in texto
    assert "123.456.789-00" not in texto
    assert protecao.texto("Pessoa Exemplo") == protecao.texto("PESSOA EXEMPLO")
