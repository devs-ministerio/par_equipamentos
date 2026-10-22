"""Guardas compartilhadas para staging de APIs; sem imports do app."""

import re

from sqlalchemy.engine import make_url


def validar_staging(url: str) -> str:
    parsed = make_url(url)
    if parsed.get_backend_name() != "postgresql" or parsed.host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("Captura exige PostgreSQL loopback.")
    if parsed.query or not re.fullmatch(r"sigeo_homologacao_base_\d{8}_api_[a-f0-9]{8}", parsed.database or ""):
        raise ValueError("Captura exige banco de staging exclusivo, sem redirecionamento.")
    return parsed.database or ""
