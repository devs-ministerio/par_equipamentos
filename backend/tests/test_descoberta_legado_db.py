"""Deduplicação contra as fontes corretas em PostgreSQL real isolado."""

from uuid import uuid4

from app.db.base import SessionLocal
from app.db.models import Convenio
from app.repositories.descoberta_legado import numeros_legados_conhecidos


def test_conhecidos_inclui_legado_e_nao_confunde_nup_manual():
    prefixo = uuid4().hex
    with SessionLocal() as db:
        legado = prefixo + "legado"
        antigo = prefixo + "antigo"
        manual = prefixo + "manual"
        db.add_all(
            [
                Convenio(numero=legado, convenente_nome="Teste", tipo_contratacao="Convênio"),
                Convenio(numero=antigo, convenente_nome="Teste", tipo_contratacao=None),
                Convenio(numero=manual, convenente_nome="Teste", tipo_contratacao="FAF"),
            ]
        )
        db.flush()
        conhecidos = numeros_legados_conhecidos(db)
        assert {legado, antigo} <= conhecidos
        assert manual not in conhecidos
        db.rollback()
