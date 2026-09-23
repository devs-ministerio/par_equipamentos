"""Configuracao do backend, lida do ambiente (nunca hardcoded).

Local: valores vem do arquivo .env. Em nuvem (Railway/Render/etc) vem das
variaveis de ambiente do proprio servico -- por isso nada aqui pode ter
valor fixo de localhost.
"""
import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str

    # Credencial separada pro Alembic (Plan Mode database 2026-09-16/17,
    # Bloco 1/4): a API roda com `sigeo_runtime` (so DML, sem privilegio pra
    # criar/alterar tabela); migration roda com `sigeo_migration` (dono dos
    # objetos, unico com DDL). Vazio faz `database_url_alembic` (abaixo) cair
    # de volta pro `database_url` -- necessario em ambiente local/teste
    # (`TEST_DATABASE_URL`) que ainda usa um unico role sem essa separacao.
    database_url_migration: str = ""

    # Origens autorizadas a chamar a API (CORS). Lista separada por virgula.
    # Em producao precisa conter a URL do frontend publicado, senao o
    # navegador bloqueia toda requisicao vinda de la.
    cors_origins: str = "http://localhost:5173"

    # Usado para assinar JWTs de login. Validado no boot (ver
    # `_validar_jwt_secret` abaixo, Plan Mode seguranca 2026-09-16, Bloco 2)
    # -- antes so falhava em runtime, na primeira chamada de login/rota
    # autenticada (503), deixando o processo subir e servir trafego mesmo
    # com o segredo vazio.
    jwt_secret: str = ""

    # Duracao do access token -- reduzido de 8h (achado do diagnostico) pra
    # minutos, Bloco 2. Refresh token (mais longo) e quem sustenta a sessao.
    access_token_expire_minutes: int = 20
    refresh_token_expire_days: int = 14

    # Atributos do cookie HttpOnly de sessao (Bloco 2). `cookie_samesite`
    # default "none" porque frontend (Vercel) e backend (Render) sao
    # dominios diferentes -- cookie cross-site so e enviado pelo browser
    # com SameSite=None + Secure (ver Plan Mode, secao 2.1). `cookie_domain`
    # fica vazio (None) quando front/back nao compartilham um dominio raiz,
    # que e o caso hoje.
    cookie_secure: bool = True
    cookie_samesite: str = "none"
    cookie_domain: str | None = None

    # Chave gratuita de autoatendimento (login gov.br, sem aprovacao manual)
    # gerada em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
    # -- necessaria pro header `chave-api-dados` da API do Portal da
    # Transparencia (consulta de convenio por numero). Opcional pra
    # aplicacao subir; sem ela o client de convenios.py falha explicito
    # (ver ConvenioClient.__init__).
    portal_transparencia_api_key: str = ""

    # Gateway HTTP de e-mail. A aplicação só entrega conteúdo ao gateway;
    # não mantém transporte SMTP, remetente ou credenciais do provedor.
    # Configuração ausente bloqueia convite/redefinição e nunca expõe token
    # ou senha na resposta da API.
    mail_api_url: str = ""
    mail_api_secret: str = ""
    app_public_url: str = "http://localhost:5173"

    # Em produção, configurar URI de storage compartilhado compatível com
    # limits/slowapi (ex.: Redis). `memory://` é aceitável apenas no dev local
    # e preserva a execução sem serviço externo.
    rate_limit_storage_uri: str = "memory://"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("jwt_secret")
    @classmethod
    def _validar_jwt_secret(cls, v: str) -> str:
        """Derruba o boot (nao a primeira request) se o segredo estiver
        vazio ou curto demais -- Plan Mode seguranca 2026-09-16, Bloco 2.
        Validador roda na construcao de `Settings()` (import de app.config),
        nao em atribuicao posterior -- `monkeypatch.setattr(settings,
        "jwt_secret", "")` em teste continua funcionando sem disparar isto
        (ver test_monitoramento.py::test_create_access_token_exige_jwt_secret,
        que testa o outro guard, em runtime, de create_access_token)."""
        if len(v) < 32:
            raise ValueError(
                "JWT_SECRET ausente ou curto demais (minimo 32 caracteres) -- "
                "boot recusado (Plan Mode seguranca 2026-09-16, Bloco 2)."
            )
        return v

    @property
    def database_url_normalizada(self) -> str:
        """Alguns provedores entregam a URL no formato antigo `postgres://`
        (ou `postgresql://` sem driver), que o SQLAlchemy 2 aceita mas resolve
        pro driver errado. Normaliza sempre pro psycopg (v3) -- e a unica
        dependencia de driver Postgres do projeto (psycopg2 nem esta
        instalado; ver pyproject.toml). Bug corrigido em 2026-08-21: isso
        apontava pra "postgresql+psycopg2" e so nao quebrava porque o .env
        local ja vem como "postgresql+psycopg://" (nao cai em nenhum dos
        dois `if`) -- no primeiro deploy com DATABASE_URL vindo cru do
        provedor (formato comum em Railway/Render/Heroku) a API cairia no
        boot por driver ausente."""
        return self._normaliza_driver(self.database_url)

    @staticmethod
    def _normaliza_driver(url: str) -> str:
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg://", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    @property
    def database_url_alembic(self) -> str:
        """URL normalizada para o Alembic -- usa `database_url_migration`
        quando definida (role `sigeo_migration`, dono do schema), senao cai
        pro `database_url` de runtime (ambiente local/teste sem a separacao
        de role ainda aplicada).

        `os.environ["DATABASE_URL"]` (variavel exportada de verdade no
        processo, nao o valor ja mesclado pelo pydantic-settings a partir
        do `.env`) tem precedencia sobre `database_url_migration` quando
        presente -- Plan Mode database 2026-09-17, Bloco 2. Sem isso, um
        operador que exporta `DATABASE_URL=...` no shell pra rodar
        `alembic upgrade head` contra um Postgres local pontual acaba
        atingindo o Neon, porque `.env` local tem `DATABASE_URL_MIGRATION`
        setado (incidente real, ver Plan Mode). `env_file=".env"` do
        `SettingsConfigDict` nao grava o `.env` em `os.environ` -- so
        mescla internamente no objeto `Settings` -- entao
        `os.environ.get("DATABASE_URL")` so existe quando alguem exportou
        de verdade ou um workflow define `env:` no job (caso de
        `migrar_banco.yml`, que ja seta `DATABASE_URL` e continua
        funcionando sem mudanca).

        `Config.set_main_option` passa pelo parser de interpolacao do
        configparser, entao `%` literal em senha/usuario precisa ser escapado
        antes de entrar no sqlalchemy.url.
        """
        database_url_exportada = os.environ.get("DATABASE_URL")
        if database_url_exportada:
            url = self._normaliza_driver(database_url_exportada)
        elif self.database_url_migration:
            url = self._normaliza_driver(self.database_url_migration)
        else:
            url = self.database_url_normalizada
        return url.replace("%", "%%")

    @field_validator("cors_origins")
    @classmethod
    def _validar_cors_origins(cls, v: str) -> str:
        """Bloco 4 do Plan Mode seguranca 2026-09-16: `*` nunca e valido
        aqui (a API roda com `allow_credentials=True`, e wildcard com
        credencial e exatamente a combinacao que a constituicao de
        seguranca proibe). Origem `http://` (nao `https://`) so e aceita
        pra localhost/127.0.0.1 -- e o unico caso de dev legitimo; qualquer
        outra origem HTTP e presumida producao mal configurada e derruba o
        boot em vez de servir trafego inseguro."""
        for origem in (o.strip() for o in v.split(",") if o.strip()):
            if origem == "*":
                raise ValueError("CORS_ORIGINS nunca pode conter '*' (API roda com allow_credentials=True).")
            if origem.startswith("http://") and not origem.startswith(("http://localhost", "http://127.0.0.1")):
                raise ValueError(
                    f"CORS_ORIGINS com origem HTTP fora de localhost ({origem!r}) -- use https:// em producao."
                )
        return v

    @property
    def cors_origins_lista(self) -> list[str]:
        return [origem.strip() for origem in self.cors_origins.split(",") if origem.strip()]

    @property
    def servico_email_configurado(self) -> bool:
        return bool(self.mail_api_url and self.mail_api_secret)


settings = Settings()  # type: ignore[call-arg]  # valores obrigatórios vêm do ambiente no boot
