from __future__ import annotations

from types import SimpleNamespace

from scripts.projetar_itens_plano import Contexto, alvo_item_api, alvo_item_manual


def _catalogo(id_: int, codigo: str, controla: bool = True):
    return SimpleNamespace(id=id_, codigo=codigo, controle_por_unidade=controla)


def _ctx(decisoes: dict | None = None) -> Contexto:
    aceleradores = _catalogo(1, "acelerador_linear")
    mamografo = _catalogo(2, "mamografo")
    return Contexto(
        catalogo_por_codigo={"acelerador_linear": aceleradores, "mamografo": mamografo},
        catalogo_por_id={1: aceleradores, 2: mamografo},
        catalogo_do_codigo={"011806": 1, "010925": 2},
        codigos_validos={"011806", "010925"},
        codigo_por_nome={"MAMOGRAFO": "010925"},
        decisoes=decisoes or {},
        instrumentos={},
    )


def test_acelerador_manual_de_persus_recebe_a_regra_da_equipe() -> None:
    alvo = alvo_item_manual(_ctx(), "PERSUS II", {"DESCRICAO_ITEM": "Acelerador Linear"})
    assert (alvo.codigo_item, alvo.codigo_fonte, alvo.controla_unidade) == ("011806", "regra_da_equipe", True)


def test_acelerador_manual_fora_de_persus_nao_recebe_codigo() -> None:
    alvo = alvo_item_manual(_ctx(), "FAF", {"DESCRICAO_ITEM": "Acelerador Linear"})
    assert alvo.codigo_item is None
    assert alvo.familia == "acelerador_linear"


def test_codigo_no_texto_vale_quando_existe_na_renem() -> None:
    alvo = alvo_item_manual(_ctx(), "PERSUS I", {"DESCRICAO_ITEM": "010925-Mamógrafo"})
    assert (alvo.codigo_item, alvo.codigo_fonte) == ("010925", "descricao")


def test_nome_identico_a_um_item_da_renem() -> None:
    alvo = alvo_item_manual(_ctx(), "TED", {"DESCRICAO_ITEM": "Mamógrafo"})
    assert (alvo.codigo_item, alvo.codigo_fonte) == ("010925", "nome_renem")


def test_item_com_dois_equipamentos_fica_sem_familia_e_sem_controle() -> None:
    alvo = alvo_item_manual(_ctx(), "FAF", {"DESCRICAO_ITEM": "Ultrasom + Mamógrafo"})
    assert alvo.familia is None
    assert alvo.controla_unidade is False


def test_decisao_pendente_nunca_controla_unidade() -> None:
    decisao = SimpleNamespace(
        tipo_lancamento="aquisicao", conta_unidade=True, status="pendente", codigo_item=None, origem="motor"
    )
    item = {"ID_ITEM_PAD": "1", "DESCRICAO_ITEM": "Mamógrafo digital", "VALOR_TOTAL_ITEM": "100"}
    assert alvo_item_api(_ctx({("123", "1"): decisao}), "123", item).controla_unidade is False
    assert alvo_item_api(_ctx(), "123", item).controla_unidade is True


def test_decisao_da_equipe_define_o_codigo() -> None:
    decisao = SimpleNamespace(
        tipo_lancamento="aquisicao",
        conta_unidade=True,
        status="aplicada",
        codigo_item="010925",
        origem="revisao_equipe",
    )
    item = {"ID_ITEM_PAD": "2", "DESCRICAO_ITEM": "Equipamento de imagem", "VALOR_TOTAL_ITEM": "100"}
    alvo = alvo_item_api(_ctx({("123", "2"): decisao}), "123", item)
    assert (alvo.codigo_item, alvo.codigo_fonte, alvo.controla_unidade) == ("010925", "definido_pela_equipe", True)


def test_rendimento_herda_o_principal_so_quando_ele_e_unico():
    from scripts.projetar_itens_plano import resolver_principais

    registros = [
        (1, ("siconv", "a"), "aquisicao", 10),
        (1, ("siconv", "r"), "rendimento_aplicacao", None),
        (2, ("siconv", "b"), "aquisicao", 10),
        (2, ("siconv", "c"), "aquisicao", 11),
        (2, ("siconv", "r2"), "rendimento_aplicacao", None),
        (2, ("siconv", "r3"), "rendimento_aplicacao", 11),
    ]
    assert resolver_principais(registros) == {
        ("siconv", "r"): ("siconv", "a"),  # um só principal no convênio
        ("siconv", "r2"): None,  # dois principais: rateio a definir
        ("siconv", "r3"): ("siconv", "c"),  # família conhecida desempata
    }


def test_multiplo_manual_vai_para_a_fila_sem_controle():
    alvo = alvo_item_manual(_ctx(), "FAF", {"DESCRICAO_ITEM": "Ultrasom + Mamógrafo"})
    assert (alvo.tipo_lancamento, alvo.pendente) == ("multiplo", True)


def test_rendimento_e_outro_equipamento_nao_entram_na_fila():
    rend = alvo_item_api(
        _ctx(), "1", {"ID_ITEM_PAD": "9", "DESCRICAO_ITEM": "Utilização de rendimento de aplicação para o mamógrafo"}
    )
    assert rend.tipo_lancamento == "rendimento_aplicacao" and rend.pendente is False and rend.controla_unidade is False
    outro = alvo_item_api(
        _ctx(), "1", {"ID_ITEM_PAD": "10", "DESCRICAO_ITEM": "Cadeira de rodas", "VALOR_TOTAL_ITEM": "900"}
    )
    assert outro.pendente is False
