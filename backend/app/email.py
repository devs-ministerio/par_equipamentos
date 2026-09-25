"""Entrega convites e redefinições pelo gateway HTTP de e-mail."""

from html import escape

import requests

from app.config import settings


def montar_url_acesso(*, token: str, caminho: str) -> str:
    """Monta URL cujo token fica no fragmento, nunca na querystring."""
    return f"{settings.app_public_url.rstrip('/')}{caminho}#token={token}"


def montar_conteudo_acesso(*, nome: str, url: str) -> tuple[str, str, str]:
    """Produz preheader, corpo texto e HTML seguro para o gateway de e-mail."""
    subtitle = "Ação necessária no SIGEO"
    texto = (
        f"Olá, {nome}.\n\n"
        "Você recebeu uma solicitação de acesso ao SIGEO. "
        f"Use este link para continuar:\n{url}\n\n"
        "O link expira em 30 minutos e pode ser usado uma única vez."
    )
    html = f"""<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f7f6;color:#18342e;font-family:Arial,sans-serif">
    <main style="max-width:560px;margin:24px auto;padding:32px;background:#ffffff;border-radius:12px">
      <p style="margin:0 0 8px;color:#40665c;font-size:14px">{escape(subtitle)}</p>
      <h1 style="margin:0 0 20px;font-size:24px">Olá, {escape(nome)}.</h1>
      <p>Você recebeu uma solicitação de acesso ao SIGEO.</p>
      <p style="margin:24px 0"><a href="{escape(url, quote=True)}" style="display:inline-block;padding:12px 18px;background:#12634f;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:bold">Continuar no SIGEO</a></p>
      <p style="color:#40665c;font-size:14px">O link expira em 30 minutos e pode ser usado uma única vez.</p>
    </main>
  </body>
</html>"""
    return subtitle, texto, html


def enviar_link(*, destinatario: str, nome: str, token: str, assunto: str, caminho: str) -> None:
    if not settings.servico_email_configurado:
        raise RuntimeError("Serviço de e-mail não configurado.")

    # Fragmentos não são transmitidos em requests HTTP: evita que o token de
    # uso único apareça em logs de borda, histórico de URL ou querystrings.
    url = montar_url_acesso(token=token, caminho=caminho)
    _subtitle, _texto, html = montar_conteudo_acesso(nome=nome, url=url)
    # Contrato do gateway atualizado pelo time responsável pela API de
    # e-mail: `to`/`subject`/`fromName`/`html` -- `subtitle`/`body` (texto
    # puro) não fazem mais parte do payload aceito (subtitle continua
    # embutido no próprio HTML, ver montar_conteudo_acesso).
    resposta = requests.post(
        settings.mail_api_url,
        headers={"x-api-key": settings.mail_api_secret},
        json={"to": destinatario, "subject": assunto, "fromName": "SIGEO", "html": html},
        timeout=15,
    )
    resposta.raise_for_status()
