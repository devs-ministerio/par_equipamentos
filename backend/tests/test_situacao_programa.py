import pytest

from app.situacao_programa import normalizar_situacao_programa


@pytest.mark.parametrize(
    ("bruta", "esperada"),
    [
        ("Inaugurada", "Em operação"),
        ("INAUGURADO", "Em operação"),
        ("  inaugurada ", "Em operação"),
        ("Em operação", "Em operação"),
        ("NÃO INAUGURADO", "Em execução"),
        ("Em execução", "Em execução"),
        ("Prestação de Contas Concluída", "Prestação de Contas Concluída"),
        (None, None),
        ("", ""),
    ],
)
def test_normaliza_situacao_do_programa(bruta, esperada):
    assert normalizar_situacao_programa(bruta) == esperada
