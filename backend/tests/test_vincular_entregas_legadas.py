from __future__ import annotations

from types import SimpleNamespace

from scripts.vincular_entregas_legadas import decidir, expandir_pela_cadeia_de_correcao


def _item(qtd: int | None = 1):
    return SimpleNamespace(quantidade_planejada=qtd)


def test_um_evento_e_um_item_vincula() -> None:
    item = _item()
    assert decidir(1, [item]) == (item, None)


def test_varias_entregas_vai_para_revisao() -> None:
    assert decidir(2, [_item()]) == (None, "varias_entregas")


def test_sem_item_controlado_vai_para_revisao() -> None:
    assert decidir(1, []) == (None, "sem_item_controlado")


def test_varios_itens_nao_escolhe_o_primeiro() -> None:
    assert decidir(1, [_item(), _item()]) == (None, "varios_itens")


def test_quantidade_desconhecida_vai_para_revisao() -> None:
    assert decidir(1, [_item(None)]) == (None, "quantidade_desconhecida")


def test_correcao_de_evento_tratado_continua_tratada() -> None:
    sucessor = {1: 2, 2: 3, 3: None, 9: None}
    assert expandir_pela_cadeia_de_correcao({1, None}, sucessor) == {1, 2, 3}
