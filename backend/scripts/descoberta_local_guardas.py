"""Destino explícito e isolado para ensaios do Radar; sem imports do app."""

from collections.abc import Mapping

from sqlalchemy.engine import make_url

from scripts.captura_local_guardas import validar_staging
from scripts.homologacao_local import validar_url_banco


def validar_destino(url: str, *, permitir_teste: bool) -> None:
    try:
        if permitir_teste:
            validar_url_banco(url, teste=True)
        else:
            validar_staging(url)
    except Exception as exc:
        raise ValueError("Descoberta local exige staging exclusivo ou banco dedicado de testes.") from exc


def validar_ambiente(ambiente: Mapping[str, str]) -> tuple[str, int, str]:
    if any(chave.startswith("PG") and valor for chave, valor in ambiente.items()):
        raise ValueError("Variáveis PG herdadas não são permitidas na descoberta local.")
    runtime = ambiente.get("DATABASE_URL", "")
    migration = ambiente.get("DATABASE_URL_MIGRATION", "")
    teste = ambiente.get("TEST_DATABASE_URL", "")
    if not runtime or not migration:
        raise ValueError("URLs locais explícitas são obrigatórias; não herdar .env.")
    permitir_teste = bool(teste)
    urls = [runtime, migration] + ([teste] if teste else [])
    destinos = []
    for url in urls:
        validar_destino(url, permitir_teste=permitir_teste)
        parsed = make_url(url)
        destinos.append((parsed.host or "", parsed.port or 5432, parsed.database or ""))
    if len(set(destinos)) != 1:
        raise ValueError("URLs de descoberta local apontam para bancos divergentes.")
    return destinos[0]
