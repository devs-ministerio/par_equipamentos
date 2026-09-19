"""Entrega de mensagens de ativação e recuperação por SMTP configurado."""
import smtplib
from email.message import EmailMessage

from app.config import settings


def enviar_link(*, destinatario: str, nome: str, token: str, assunto: str, caminho: str) -> None:
    if not settings.smtp_host or not settings.smtp_from:
        raise RuntimeError("Serviço de e-mail não configurado.")
    url = f"{settings.app_public_url.rstrip('/')}{caminho}?token={token}"
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, destinatario, assunto
    msg.set_content(f"Olá, {nome}.\n\nAcesse o link para continuar:\n{url}\n\nO link expira em 30 minutos e pode ser usado uma única vez.")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(msg)
