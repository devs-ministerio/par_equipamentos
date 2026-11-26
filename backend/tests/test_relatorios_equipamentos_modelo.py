from datetime import date

from app.services.relatorios_equipamentos_modelo import (
    COLUNAS_EQUIPAMENTO_COMPLETO,
    COLUNAS_EQUIPAMENTO_SIMPLIFICADO,
    linha_equipamento,
)
from app.services.relatorios_equipamentos_resumo import FatoEquipamento, resumo_equipamentos
from app.services.relatorios_modelo import ContextoInstrumento


def _ctx(**c):
    base = dict(
        numero="1",
        cnes="2237601",
        estabelecimento="Hospital A",
        municipio="Belo Horizonte",
        uf="MG",
        regiao="Sudeste",
        contratacao="Convênio",
        situacao_site="Em execução",
        situacao_monitoramento="Concluído",
        numero_processo="25000.1/2018-11",
        ano=2018,
        inicio_vigencia=date(2018, 3, 15),
        fim_vigencia=date(2027, 3, 15),
        tecnico="Ana",
    )
    base.update(c)
    return ContextoInstrumento(**base)


def _fato(**c):
    base = dict(
        contexto=_ctx(),
        equipamento="Acelerador Linear",
        descricao_item="011807 - Acelerador Linear",
        situacao="em_operacao",
        quantidade=1,
        valor=5_100_000.0,
        data_entrega=date(2026, 1, 10),
        data_previsao_inauguracao=date(2026, 2, 20),
        status_inauguracao="Realizada",
        marca="Varian",
        modelo="Halcyon",
        serie="2526",
    )
    base.update(c)
    return FatoEquipamento(**base)


def test_numero_de_colunas_aprovado():
    assert len(COLUNAS_EQUIPAMENTO_SIMPLIFICADO) == 16
    assert len(COLUNAS_EQUIPAMENTO_COMPLETO) == 25
    assert COLUNAS_EQUIPAMENTO_COMPLETO[8] == "Descrição do item no plano"
    assert COLUNAS_EQUIPAMENTO_COMPLETO[14:17] == (
        "Data de Entrega do Equipamento",
        "Data de Previsão/Inauguração",
        "Status da Inauguração",
    )


def test_linha_simplificada_e_completa_seguem_as_colunas():
    f = _fato()
    assert len(linha_equipamento(f, completo=False)) == 16
    completo = linha_equipamento(f, completo=True)
    assert len(completo) == 25
    assert completo[COLUNAS_EQUIPAMENTO_COMPLETO.index("Marca")] == "Varian"
    assert completo[COLUNAS_EQUIPAMENTO_COMPLETO.index("Nº do Processo")] == "25000.1/2018-11"


def test_resumo_conta_equipamentos_por_situacao():
    fatos = [
        _fato(quantidade=2),
        _fato(situacao="planejado", quantidade=3, equipamento="Mamógrafo"),
        _fato(situacao="entregue", quantidade=1),
    ]
    indicadores, quebras = resumo_equipamentos(fatos, escopo="uf", referencia=date(2026, 11, 26))
    assert indicadores == (("Quantidade de Equipamentos", 6),)
    assert quebras[0].linhas == [
        ("Planejado", 3, "50%"),
        ("Entregue, a inaugurar", 1, "17%"),
        ("Em operação", 2, "33%"),
        ("Cancelado", 0, "0%"),
        ("Total", 6, "100%"),
    ]
    assert [q.titulo for q in quebras][:3] == ["Por situação", "Por equipamento", "Por contratação"]


def test_quebra_por_uf_aparece_so_quando_ha_mais_de_um_estado():
    um_estado = [_fato(), _fato()]
    _, quebras = resumo_equipamentos(um_estado, escopo="uf", referencia=date(2026, 11, 26))
    assert "Por UF" not in [q.titulo for q in quebras]
    dois = [_fato(), _fato(contexto=_ctx(uf="SP", regiao="Sudeste"))]
    _, quebras = resumo_equipamentos(dois, escopo="uf", referencia=date(2026, 11, 26))
    assert quebras[2].titulo == "Por UF"


def test_valor_cancelado_fica_em_linha_propria_e_fora_do_entregue():
    fatos = [
        _fato(situacao="em_operacao", valor=100.0),
        _fato(situacao="entregue", valor=50.0),
        _fato(situacao="planejado", valor=30.0),
        _fato(situacao="cancelado", valor=999.0),
    ]
    _, quebras = resumo_equipamentos(fatos, escopo="uf", referencia=date(2026, 11, 26))
    valores = next(q for q in quebras if q.titulo == "Valor do equipamento")
    assert valores.linhas == [("Planejado", 30.0), ("Entregue", 150.0), ("Cancelado", 999.0)]


def test_quebra_por_estabelecimento_em_recorte_de_municipio():
    _, quebras = resumo_equipamentos([_fato()], escopo="municipio", referencia=date(2026, 11, 26))
    assert quebras[2].titulo == "Por estabelecimento"


def test_resumo_brasil_exibe_regioes_e_nao_converte_valor_ausente_em_zero():
    sul = _ctx(uf="RS", regiao="Sul")
    fatos = [_fato(situacao="entregue", valor=None), _fato(contexto=sul, situacao="cancelado", valor=0.0)]
    _, quebras = resumo_equipamentos(fatos, escopo="brasil", referencia=date(2026, 11, 26))
    assert quebras[2].titulo == "Por região"
    valores = next(q for q in quebras if q.titulo == "Valor do equipamento")
    assert valores.linhas == [("Planejado", None), ("Entregue", None), ("Cancelado", 0.0)]
