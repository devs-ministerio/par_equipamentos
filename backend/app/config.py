"""Configuracao do backend, lida do ambiente (nunca hardcoded).

Local: valores vem do arquivo .env. Em nuvem (Railway/Render/etc) vem das
variaveis de ambiente do proprio servico -- por isso nada aqui pode ter
valor fixo de localhost.
"""
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

        `Config.set_main_option` passa pelo parser de interpolacao do
        configparser, entao `%` literal em senha/usuario precisa ser escapado
        antes de entrar no sqlalchemy.url.
        """
        url = self._normaliza_driver(self.database_url_migration) if self.database_url_migration else self.database_url_normalizada
        return url.replace("%", "%%")

    @property
    def cors_origins_lista(self) -> list[str]:
        return [origem.strip() for origem in self.cors_origins.split(",") if origem.strip()]


settings = Settings()
