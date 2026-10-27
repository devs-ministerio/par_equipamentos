"""Publicação parcial explícita estabelece baseline sem esconder a pendência."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.db.base import SessionLocal
from app.db.models import FonteCaptura
from scripts.atualizar_dados_producao import _tem_baseline


@pytest.mark.parametrize(
    ("status", "publicacao", "esperado"),
    [
        ("ok", None, True),
        ("erro", "concluida", False),
        ("parcial", None, False),
        ("parcial", "conflito_revisao", False),
        ("parcial", "concluida", True),
    ],
)
def test_baseline_exige_publicacao_confirmada_no_banco(status, publicacao, esperado):
    # Arrange: módulo protegido pelo TEST_DATABASE_URL dedicado no conftest.
    fonte = f"pytest-baseline-{uuid4().hex}"
    db = SessionLocal()
    captura = FonteCaptura(
        fonte=fonte,
        status=status,
        iniciado_em=datetime.now(UTC),
        finalizado_em=datetime.now(UTC),
        detalhes={"publicacao": publicacao},
    )
    db.add(captura)
    db.commit()
    try:
        # Act
        resultado = _tem_baseline(fonte)
        # Assert
        assert resultado is esperado
    finally:
        db.query(FonteCaptura).filter(FonteCaptura.fonte == fonte).delete()
        db.commit()
        db.close()
