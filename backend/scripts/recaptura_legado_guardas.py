"""Guardas de recaptura local, antes de importar Settings ou abrir HTTP."""

from collections.abc import Mapping

from sqlalchemy.engine import make_url

from scripts.descoberta_local_guardas import validar_ambiente
from scripts.homologacao_local import validar_url_banco
from scripts.servir_local_recuperacao import conferir_ambiente_servido


def validar_configuracao_coleta(ambiente: Mapping[str, str]) -> None:
    """Não herdar chave/JWT nem ativar telemetria de produção via .env."""
    if len(ambiente.get("JWT_SECRET", "")) < 32:
        raise ValueError("JWT local deve ser fornecido explicitamente.")
    if not ambiente.get("PORTAL_TRANSPARENCIA_API_KEY", "").strip():
        raise ValueError("Chave do Portal deve ser fornecida explicitamente ao worker local.")
    if ambiente.get("NEW_RELIC_ENABLED", "").casefold() != "false":
        raise ValueError("Telemetria externa deve permanecer desabilitada no ensaio local.")


def conferir_conexao_carregada(url: str, ambiente: Mapping[str, str]) -> None:
    carregada, autorizada = make_url(url), make_url(ambiente["DATABASE_URL"])
    if (
        carregada.query
        or carregada.get_backend_name() != "postgresql"
        or (carregada.host, carregada.port or 5432, carregada.database, carregada.username)
        != (autorizada.host, autorizada.port or 5432, autorizada.database, autorizada.username)
    ):
        raise ValueError("Conexão carregada difere do destino e runtime locais autorizados.")


def validar_ambiente_recaptura(ambiente: Mapping[str, str]) -> tuple[str, int, str]:
    if ambiente.get("SIGEO_LOCAL_READY") != "true":
        return validar_ambiente(ambiente)
    if any(chave.startswith("PG") and valor for chave, valor in ambiente.items()):
        raise ValueError("Variáveis PG herdadas não são permitidas na recaptura local.")
    url = ambiente.get("DATABASE_URL", "")
    validar_url_banco(url)  # Loopback e sem parâmetros antes de conferir OID/role.
    conferir_ambiente_servido(dict(ambiente))
    parsed = make_url(url)
    return parsed.host or "", parsed.port or 5432, parsed.database or ""
