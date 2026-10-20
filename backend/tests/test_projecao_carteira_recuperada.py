"""Fonte literal, Decimal, ausências e fronteiras da projeção reconstruída."""

from datetime import date
from decimal import Decimal

import pytest

from app.domain_errors import ConflictError
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao
from app.services.projecao_legado import projetar_carteira
from tests.test_prova_recaptura_legado import dados as dados


def projetar(dados):
    return projetar_carteira(CapturaLegadoParaPromocao.model_validate(dados))


def test_fonte_siconv_literal_portal_identificacao_e_ausencia_nao_vira_zero(dados):
    dados["convenio"]["SIT_CONVENIO"] = "Prestação de Contas Concluída"
    dados["portal"]["situacao"] = "Situação divergente no Portal"
    dados["portal"]["valor"] = 999999
    dados["portal"]["valorLiberado"] = 999999
    p = projetar(dados)
    assert p.situacao == "Prestação de Contas Concluída" and p.situacao_portal == "Situação divergente no Portal"
    assert p.valor_global == Decimal("1000.50") and p.valor_desembolsado is None
    assert p.convenente_cnpj == "00000000000100" and p.ano_instrumento == 2026
    assert p.regiao == "Nordeste" and p.programa is None
    assert p.valor_pago_fornecedor is None and p.pagamentos_count == 0
    assert "cnes" not in p.model_dump() and "equipamentos_tags" not in p.model_dump()
    assert p.siconv_raw["_espelho"] == {"versao": 1}
    assert p.siconv_raw["pagamentos"] == [] and p.siconv_raw["desembolsos"] == []


@pytest.mark.parametrize(
    "campo,coluna",
    [
        ("VL_REPASSE_CONV", "valor_repasse"),
        ("VL_EMPENHADO_CONV", "valor_empenhado"),
        ("VL_DESEMBOLSADO_CONV", "valor_desembolsado"),
        ("VL_CONTRAPARTIDA_CONV", "valor_contrapartida"),
        ("VL_SALDO_CONTA", "valor_saldo_conta"),
    ],
)
@pytest.mark.parametrize("valor,esperado", [("0", Decimal(0)), ("", None), ("-12,34", Decimal("-12.34"))])
def test_financeiro_nao_arredonda_nem_inventa_totais(dados, campo, coluna, valor, esperado):
    dados["convenio"][campo] = valor
    assert getattr(projetar(dados), coluna) == esperado


@pytest.mark.parametrize("valor", ["NaN", "Infinity", "lixo", True, 12])
def test_financeiro_adicional_invalido_aborta_em_vez_de_virar_nulo(dados, valor):
    dados["convenio"]["VL_REPASSE_CONV"] = valor
    with pytest.raises(ConflictError):
        projetar(dados)


def test_pagamentos_preservam_estorno_zero_e_contagem(dados):
    dados["filhas"]["pagamentos"] = [
        {"NR_CONVENIO": "999001", "NR_MOV_FIN": str(i), "VL_PAGO": valor}
        for i, valor in enumerate(["0,10", "0,20", "-0,30"], 1)
    ]
    p = projetar(dados)
    assert p.valor_pago_fornecedor == Decimal("0.00") and p.pagamentos_count == 3
    assert p.siconv_raw["pagamentos"][2]["VL_PAGO"] == "-0,30"


def test_ultima_liberacao_do_portal_nao_substitui_desembolso_total(dados):
    dados["convenio"]["VL_DESEMBOLSADO_CONV"] = "900,50"
    dados["portal"].update(dataUltimaLiberacao="02/10/2026", valorDaUltimaLiberacao="123,45")
    p = projetar(dados)
    assert p.data_ultima_liberacao == date(2026, 10, 2)
    assert p.valor_ultima_liberacao == Decimal("123.45") and p.valor_desembolsado == Decimal("900.50")


@pytest.mark.parametrize("data_fonte", ["20260101", "01/01/2026", "2026-01-01"])
def test_vigencia_fallback_siconv_e_prioridade_portal(dados, data_fonte):
    dados["convenio"].update(DIA_INIC_VIGENC_CONV=data_fonte, DIA_FIM_VIGENC_CONV="20271231")
    assert projetar(dados).data_inicio_vigencia == date(2026, 1, 1)
    dados["portal"]["dataInicioVigencia"] = "02/10/2026"
    assert projetar(dados).data_inicio_vigencia == date(2026, 10, 2)


@pytest.mark.parametrize("defeito", ["vigencia", "data", "ibge", "contratacao", "liberacao"])
def test_projecao_incoerente_aborta_sem_fallback_silencioso(dados, defeito):
    if defeito == "vigencia":
        dados["convenio"].update(DIA_INIC_VIGENC_CONV="20271231", DIA_FIM_VIGENC_CONV="20260101")
    elif defeito == "data":
        dados["convenio"]["DIA_FIM_VIGENC_CONV"] = "20260230"
    elif defeito == "ibge":
        dados["portal"]["municipioConvenente"]["codigoIBGE"] = "123"
    elif defeito == "contratacao":
        dados["convenio"]["SITUACAO_CONTRATACAO"] = 123
    else:
        dados["portal"]["valorDaUltimaLiberacao"] = True
    with pytest.raises(ConflictError):
        projetar(dados)


def test_programas_capturados_preservados_sem_escolher_primeiro(dados):
    dados["programas"] = {
        "vinculos": [{"ID_PROPOSTA": "111001", "ID_PROGRAMA": str(i)} for i in (1, 2)],
        "catalogo": [{"ID_PROGRAMA": "1", "NOME_PROGRAMA": "B"}, {"ID_PROGRAMA": "2", "NOME_PROGRAMA": "A"}],
    }
    assert projetar(dados).programa == "A · B"
