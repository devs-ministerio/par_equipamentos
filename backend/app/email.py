"""Entrega convites e redefinições pelo gateway HTTP de e-mail."""

from dataclasses import dataclass
from html import escape

import requests

from app.config import settings

_NOME_REMETENTE = "Sistema de Gestão de Equipamentos em Oncologia - SIGEO"

# Mesma paleta de frontend/src/styles/tokens.ts -- mudar uma exige mudar a
# outra (não há fonte única compartilhada entre back e front pra isso).
_COR_PRIMARIA = "#2D6A5C"
_COR_TEXTO = "#1C1A16"
_COR_TEXTO_CORPO = "#3A362E"
_COR_SUPERFICIE = "#F6F4EF"
_COR_BORDA = "#E4DFD3"
_COR_TEXTO_MUTED = "#6B6459"
_COR_TEXTO_SUBTLE = "#9A9284"
_FONTE = "-apple-system,BlinkMacSystemFont,'Public Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif"

_PRAZO_EXPIRACAO = "7 dias"


@dataclass(frozen=True)
class _ContextoAcesso:
    preheader: str
    eyebrow: str
    corpo: str
    cta: str


# Chave = `caminho` de `montar_url_acesso` -- cada rota de destino tem um
# texto específico (achado: "Continuar" genérico não dizia se o link ativava
# conta ou trocava senha). Caminho não reconhecido cai em `_CONTEXTO_PADRAO`.
_CONTEXTOS: dict[str, _ContextoAcesso] = {
    "/ativar": _ContextoAcesso(
        preheader="Ative sua conta no SIGEO -- o link expira em 7 dias.",
        eyebrow="Ativação de conta",
        corpo="Você foi convidado a acessar o SIGEO. Clique no botão abaixo para criar sua senha e ativar sua conta.",
        cta="Ativar minha conta",
    ),
    "/redefinir-senha": _ContextoAcesso(
        preheader="Redefina sua senha no SIGEO -- o link expira em 7 dias.",
        eyebrow="Redefinição de senha",
        corpo="Recebemos uma solicitação para redefinir sua senha no SIGEO. Clique no botão abaixo para escolher uma nova senha.",
        cta="Redefinir senha",
    ),
}
_CONTEXTO_PADRAO = _ContextoAcesso(
    preheader="Você recebeu uma solicitação de acesso ao SIGEO.",
    eyebrow="Ação necessária no SIGEO",
    corpo="Você recebeu uma solicitação de acesso ao SIGEO. Clique no botão abaixo para continuar.",
    cta="Continuar",
)


def montar_url_acesso(*, token: str, caminho: str) -> str:
    """Monta URL cujo token fica no fragmento, nunca na querystring."""
    return f"{settings.app_public_url.rstrip('/')}{caminho}#token={token}"


def montar_conteudo_acesso(*, nome: str, url: str, caminho: str = "") -> tuple[str, str, str]:
    """Produz preheader, corpo texto e HTML seguro para o gateway de e-mail.

    HTML montado só com tabelas + estilo inline (sem CSS externo/flexbox):
    é o único jeito de ter aparência consistente entre Gmail/Outlook/Apple
    Mail, que ignoram ou removem <style>/grid/flex."""
    contexto = _CONTEXTOS.get(caminho, _CONTEXTO_PADRAO)
    url_escapada = escape(url, quote=True)
    nome_escapado = escape(nome)

    texto = (
        f"Olá, {nome}.\n\n"
        f"{contexto.corpo}\n\n"
        f"Link: {url}\n\n"
        f"O link expira em {_PRAZO_EXPIRACAO} e pode ser usado uma única vez. "
        "Se você não solicitou isso, pode ignorar este e-mail com segurança."
    )

    html = f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>SIGEO</title>
  </head>
  <body style="margin:0;padding:0;background-color:{_COR_SUPERFICIE};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:{_COR_SUPERFICIE};">
      {escape(contexto.preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_COR_SUPERFICIE};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid {_COR_BORDA};border-radius:12px;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid {_COR_BORDA};">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:36px;height:36px;background-color:{_COR_PRIMARIA};border-radius:8px;text-align:center;">
                      <span style="display:block;font-family:{_FONTE};font-size:16px;font-weight:700;line-height:36px;color:#ffffff;">S</span>
                    </td>
                    <td style="padding-left:12px;">
                      <span style="display:block;font-family:{_FONTE};font-size:15px;font-weight:700;color:{_COR_TEXTO};">SIGEO</span>
                      <span style="display:block;font-family:{_FONTE};font-size:11px;color:{_COR_TEXTO_SUBTLE};">Gestão de Equipamentos em Oncologia</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 10px;font-family:{_FONTE};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:{_COR_PRIMARIA};">
                  {escape(contexto.eyebrow)}
                </p>
                <h1 style="margin:0 0 16px;font-family:{_FONTE};font-size:22px;font-weight:700;color:{_COR_TEXTO};">
                  Olá, {nome_escapado}.
                </h1>
                <p style="margin:0 0 28px;font-family:{_FONTE};font-size:15px;line-height:1.6;color:{_COR_TEXTO_CORPO};">
                  {escape(contexto.corpo)}
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:{_COR_PRIMARIA};">
                      <a href="{url_escapada}" style="display:inline-block;padding:13px 28px;font-family:{_FONTE};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
                        {escape(contexto.cta)}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0;font-family:{_FONTE};font-size:13px;line-height:1.6;color:{_COR_TEXTO_SUBTLE};">
                  Se o botão não funcionar, copie e cole este link no navegador:<br>
                  <a href="{url_escapada}" style="color:{_COR_PRIMARIA};word-break:break-all;">{url_escapada}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:{_COR_SUPERFICIE};border-top:1px solid {_COR_BORDA};border-radius:0 0 12px 12px;">
                <p style="margin:0;font-family:{_FONTE};font-size:12px;line-height:1.6;color:{_COR_TEXTO_MUTED};">
                  Este link expira em {_PRAZO_EXPIRACAO} e pode ser usado uma única vez. Se você não solicitou isso, pode ignorar este e-mail com segurança.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    return contexto.eyebrow, texto, html


def enviar_link(*, destinatario: str, nome: str, token: str, assunto: str, caminho: str) -> None:
    if not settings.servico_email_configurado:
        raise RuntimeError("Serviço de e-mail não configurado.")

    # Fragmentos não são transmitidos em requests HTTP: evita que o token de
    # uso único apareça em logs de borda, histórico de URL ou querystrings.
    url = montar_url_acesso(token=token, caminho=caminho)
    _eyebrow, _texto, html = montar_conteudo_acesso(nome=nome, url=url, caminho=caminho)
    # Contrato do gateway atualizado pelo time responsável pela API de
    # e-mail: `to`/`subject`/`fromName`/`html` -- `subtitle`/`body` (texto
    # puro) não fazem mais parte do payload aceito (eyebrow continua
    # embutido no próprio HTML, ver montar_conteudo_acesso).
    resposta = requests.post(
        settings.mail_api_url,
        headers={"x-api-key": settings.mail_api_secret},
        json={"to": destinatario, "subject": assunto, "fromName": _NOME_REMETENTE, "html": html},
        timeout=15,
    )
    resposta.raise_for_status()
