from decimal import Decimal

import pytest

from app.valor_global import valor_global_considerado


@pytest.mark.parametrize(
    ("valor", "tipo", "confiavel", "esperado"),
    [
        (Decimal("100.50"), "Convênio", True, 100.5),
        (Decimal("100"), "Convênio", False, None),
        (Decimal("7865000"), "PERSUS II", False, 7865000.0),
        (Decimal("10"), "FAF", False, 10.0),
        (Decimal("-1"), "TED", False, None),
        (None, "FAF", False, None),
        (float("nan"), "FAF", False, None),
    ],
)
def test_valor_global_considerado(valor, tipo, confiavel, esperado):
    assert valor_global_considerado(valor, tipo_contratacao=tipo, fonte_confiavel=confiavel) == esperado
