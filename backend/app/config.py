"""Configuracao do backend, lida do ambiente (nunca hardcoded).

Local: valores vem do arquivo .env. Em nuvem (Railway/Render/etc) vem das
variaveis de ambiente do proprio servico -- por isso nada aqui pode ter
valor fixo de localhost.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str

    # Origens autorizadas a chamar a API (CORS). Lista separada por virgula.
    # Em producao precisa conter a URL do frontend publicado, senao o
    # navegador bloqueia toda requisicao vinda de la.
    cors_origins: str = "http://localhost:5173"

    # Usado para assinar JWTs de login. Sem ele, /auth/login e rotas
    # autenticadas retornam 503 em vez de operar sem seguranca.
    jwt_secret: str = ""

    # Chave gratuita de autoatendimento (login gov.br, sem aprovacao manual)
    # gerada em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
    # -- necessaria pro header `chave-api-dados` da API do Portal da
    # Transparencia (consulta de convenio por numero). Opcional pra
    # aplicacao subir; sem ela o client de convenios.py falha explicito
    # (ver ConvenioClient.__init__).
    portal_transparencia_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

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
        url = self.database_url
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg://", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    @property
    def cors_origins_lista(self) -> list[str]:
        return [origem.strip() for origem in self.cors_origins.split(",") if origem.strip()]


settings = Settings()
