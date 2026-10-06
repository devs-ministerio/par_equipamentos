import pytest
from fastapi.testclient import TestClient

from scripts.caixa_email_local import criar_app
from scripts.homologacao_local import validar_url_banco


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://usuario@fonte.invalid/sigeo_homologacao_clone_20261006",
        "postgresql://usuario@127.0.0.1/postgres",
        "postgresql://usuario@127.0.0.1/sigeo_homologacao_base_20261006",
        "sqlite:///sigeo_homologacao_clone_20261006",
        "postgresql://usuario@127.0.0.1/sigeo_homologacao_clone_20261006?host=fonte.invalid",
        "postgresql://usuario@127.0.0.1/sigeo_homologacao_clone_20261006?service=producao",
    ],
)
def test_runner_recusa_origem_ou_banco_fora_do_escopo(url):
    with pytest.raises(ValueError):
        validar_url_banco(url)


def test_runner_separa_trabalho_de_teste():
    validar_url_banco("postgresql://usuario@127.0.0.1/sigeo_test_clone_20261006", teste=True)
    with pytest.raises(ValueError):
        validar_url_banco("postgresql://usuario@127.0.0.1/sigeo_homologacao_clone_20261006", teste=True)


def test_caixa_recusa_chave_ausente(monkeypatch):
    monkeypatch.delenv("MAIL_API_SECRET", raising=False)
    with pytest.raises(ValueError):
        criar_app()


def test_caixa_exige_chave_e_nao_envia_externamente():
    chave = "chave-local-sintetica-para-teste-0001"
    client = TestClient(criar_app(chave))
    mensagem = {
        "to": "teste@example.com",
        "subject": "Ativação",
        "fromName": "SIGEO",
        "html": "<a href='http://127.0.0.1:5181/ativar#token=sintetico'>Ativar</a>",
    }
    assert client.get("/mensagens").status_code == 401
    assert client.post("/enviar", json=mensagem).status_code == 401
    assert client.post("/enviar", headers={"x-api-key": chave}, json=mensagem).status_code == 200
    resposta = client.get("/mensagens", headers={"x-api-key": chave})
    assert resposta.json()["mensagens"] == [mensagem]
    assert resposta.headers["cache-control"] == "no-store"
    mensagem["to"] = "real@saude.gov.br"
    assert client.post("/enviar", headers={"x-api-key": chave}, json=mensagem).status_code == 422
    assert len(client.get("/mensagens", headers={"x-api-key": chave}).json()["mensagens"]) == 1


def test_caixa_limita_tamanho_e_contrato():
    chave = "chave-local-sintetica-para-teste-0002"
    client = TestClient(criar_app(chave))
    assert client.post("/enviar", headers={"x-api-key": chave}, content="x" * 128_001).status_code == 413
    assert (
        client.post(
            "/enviar", headers={"x-api-key": chave}, json={"to": "teste@example.com", "token": "inesperado"}
        ).status_code
        == 422
    )


def test_caixa_limita_historico_a_duzentas_mensagens():
    # Arrange: caixa efêmera isolada, sem serviço externo.
    chave = "chave-local-sintetica-para-teste-0003"
    client = TestClient(criar_app(chave))
    headers = {"x-api-key": chave}
    # Act: ultrapassa o teto para testar descarte da mais antiga.
    for numero in range(201):
        assert (
            client.post(
                "/enviar",
                headers=headers,
                json={
                    "to": "teste@example.com",
                    "subject": str(numero),
                    "fromName": "SIGEO",
                    "html": "Mensagem sintética",
                },
            ).status_code
            == 200
        )
    mensagens = client.get("/mensagens", headers=headers).json()["mensagens"]
    # Assert: teto e ordem, sem exposição pública da caixa.
    assert len(mensagens) == 200
    assert mensagens[0]["subject"] == "1"
    assert mensagens[-1]["subject"] == "200"
