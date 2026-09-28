from typing import Any

from app.email import _NOME_REMETENTE, enviar_link, montar_conteudo_acesso, montar_url_acesso


def test_mensagem_de_acesso_preserva_token_no_fragmento_e_escapa_nome(monkeypatch):
    monkeypatch.setattr("app.email.settings.app_public_url", "https://sigeo.example")
    url = montar_url_acesso(token="token-unico", caminho="/ativar")
    eyebrow, body, html = montar_conteudo_acesso(nome="Ana <teste>", url=url, caminho="/ativar")

    assert url == "https://sigeo.example/ativar#token=token-unico"
    assert eyebrow == "Ativação de conta"
    assert "Ana <teste>" in body
    assert "7 dias" in body
    assert "Ana &lt;teste&gt;" in html
    assert "?token=" not in html


def test_montar_conteudo_acesso_diferencia_ativacao_de_redefinicao(monkeypatch):
    monkeypatch.setattr("app.email.settings.app_public_url", "https://sigeo.example")
    url = montar_url_acesso(token="token-unico", caminho="/redefinir-senha")
    eyebrow, _body, html = montar_conteudo_acesso(nome="Ana", url=url, caminho="/redefinir-senha")

    assert eyebrow == "Redefinição de senha"
    assert "Redefinir senha" in html
    assert "Ativar minha conta" not in html


def test_montar_conteudo_acesso_caminho_desconhecido_usa_contexto_padrao(monkeypatch):
    monkeypatch.setattr("app.email.settings.app_public_url", "https://sigeo.example")
    url = montar_url_acesso(token="token-unico", caminho="/outra-rota")
    eyebrow, _body, html = montar_conteudo_acesso(nome="Ana", url=url, caminho="/outra-rota")

    assert eyebrow == "Ação necessária no SIGEO"
    assert "Continuar" in html


def test_enviar_link_entrega_payload_completo_ao_gateway(monkeypatch):
    capturado: dict[str, Any] = {}

    class Resposta:
        def raise_for_status(self):
            return None

    def post(url, *, headers, json, timeout):
        capturado.update(url=url, headers=headers, json=json, timeout=timeout)
        return Resposta()

    monkeypatch.setattr("app.email.settings.mail_api_url", "https://mail.test/api/send-invite")
    monkeypatch.setattr("app.email.settings.mail_api_secret", "segredo-de-teste")
    monkeypatch.setattr("app.email.requests.post", post)

    enviar_link(
        destinatario="e2e@example.com",
        nome="Usuário E2E",
        token="token-unico",
        assunto="Ative seu acesso ao SIGEO",
        caminho="/ativar",
    )

    assert capturado["url"] == "https://mail.test/api/send-invite"
    assert capturado["headers"] == {"x-api-key": "segredo-de-teste"}
    assert capturado["timeout"] == 15
    assert capturado["json"]["to"] == "e2e@example.com"
    assert capturado["json"]["subject"] == "Ative seu acesso ao SIGEO"
    assert capturado["json"]["fromName"] == _NOME_REMETENTE
    assert "#token=token-unico" in capturado["json"]["html"]
    assert "Ativar minha conta" in capturado["json"]["html"]
    assert "subtitle" not in capturado["json"]
    assert "body" not in capturado["json"]


def test_enviar_link_recusa_gateway_sem_configuracao(monkeypatch):
    monkeypatch.setattr("app.email.settings.mail_api_url", "")
    monkeypatch.setattr("app.email.settings.mail_api_secret", "")

    try:
        enviar_link(destinatario="e2e@example.com", nome="E2E", token="token", assunto="Assunto", caminho="/ativar")
    except RuntimeError as exc:
        assert str(exc) == "Serviço de e-mail não configurado."
    else:
        raise AssertionError("O gateway sem configuração deveria ser recusado.")
