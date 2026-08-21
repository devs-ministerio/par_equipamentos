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

    # Autenticacao nao existe na Fase 1 (ver docs/design, decisao de
    # 2026-08-13) -- fica opcional pra aplicacao subir sem essa variavel.
    jwt_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def database_url_normalizada(self) -> str:
        """Alguns provedores entregam a URL no formato antigo `postgres://`,
        que o SQLAlchemy 2 nao aceita. Normaliza pro driver que usamos."""
        url = self.database_url
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg2://", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url

    @property
    def cors_origins_lista(self) -> list[str]:
        return [origem.strip() for origem in self.cors_origins.split(",") if origem.strip()]


settings = Settings()
