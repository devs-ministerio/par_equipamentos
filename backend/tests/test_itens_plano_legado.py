from app.repositories.candidatos_legados import _itens_do_plano


def test_itens_do_plano_traz_quantidade_e_valores_e_ignora_obra() -> None:
    bruto = [
        {
            "DESCRICAO_ITEM": "010805-Carro Maca Avançado",
            "TIPO_DESPESA_ITEM": "BEM",
            "QTD_ITEM": "2",
            "VALOR_UNITARIO_ITEM": "17973",
            "VALOR_TOTAL_ITEM": "35946",
        },
        {"DESCRICAO_ITEM": "Reforma da sala", "TIPO_DESPESA_ITEM": "OBRA", "QTD_ITEM": "1"},
        {"DESCRICAO_ITEM": "Poltrona Hospitalar", "TIPO_DESPESA_ITEM": "BEM"},
    ]
    itens = _itens_do_plano(bruto)
    assert [i.nome for i in itens] == ["Carro Maca Avançado", "Poltrona Hospitalar"]
    assert (itens[0].quantidade, itens[0].valor_unitario, itens[0].valor_total) == ("2", "17973", "35946")
    assert (itens[1].quantidade, itens[1].valor_total) == (None, None)


def test_itens_do_plano_sem_lista_devolve_vazio() -> None:
    assert _itens_do_plano(None) == []
