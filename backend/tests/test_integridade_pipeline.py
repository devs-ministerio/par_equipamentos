"""Publicação exige completude; ausência não representa população zero."""

import pytest

from app.pipeline.integridade import validar_populacoes


def test_populacao_ans_zero_explicito_e_valido():
    # Arrange
    ans = {"123456": 0}
    # Act
    validar_populacoes(["123456"], {"123456": 100}, ans)
    # Assert: o zero explícito não foi substituído ou removido.
    assert ans == {"123456": 0}


@pytest.mark.parametrize(
    ("municipios", "populacao", "ans"),
    [
        ([], {}, {}),
        (["a"], {}, {"a": 0}),
        (["a"], {"a": 100}, {}),
        (["a", "b"], {"a": 100}, {"a": 0, "b": 0}),
        (["a", "b"], {"a": 100, "b": 100}, {"a": 0}),
        (["a"], {"a": 0}, {"a": 0}),
        (["a"], {"a": 100}, {"a": -1}),
    ],
)
def test_populacao_incompleta_ou_invalida_bloqueia_publicacao(municipios, populacao, ans):
    # Arrange / Act / Assert
    with pytest.raises(ValueError, match="publicação cancelada"):
        validar_populacoes(municipios, populacao, ans)
