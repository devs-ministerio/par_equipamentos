"""Precedência e evidência testadas sem mock do classificador."""

from datetime import date

import pytest

from app.schemas_relatorios_encerrados import FatoEncerramento, FiltroEncerramento, OrdemEncerramento
from app.services.relatorios_encerrados import classificar_encerrados

FECHADA = "Prestação de Contas Concluída"


def fato(**campos) -> FatoEncerramento:
    return FatoEncerramento.model_validate(
        {"origem": "instrumento", "numero": "999000", "nome": "Instituição sintética", "tipo": "Convênio", **campos}
    )


@pytest.mark.parametrize(
    "campos,motivo,pendente",
    [
        ({"situacao_carteira": FECHADA}, "Prestação de contas concluída", False),
        ({"situacao_carteira": FECHADA, "conclusao_ativa": True}, "Prestação de contas concluída", False),
        ({"conclusao_ativa": True}, "Conclusão interna sem data", True),
        (
            {"conclusao_ativa": True, "data_conclusao": date(2026, 1, 1)},
            "Concluído no monitoramento interno",
            False,
        ),
        (
            {"conclusao_ativa": True, "data_conclusao": date(2026, 1, 1), "situacao_carteira": "Em execução"},
            "Concluído no monitoramento interno",
            False,
        ),
        (
            {"situacao_carteira": FECHADA, "situacao_monitoramento": "Em execução"},
            "Divergência de prestação de contas entre fontes",
            True,
        ),
        (
            {"situacao_monitoramento": FECHADA, "situacao_oficial": "Em execução"},
            "Divergência de prestação de contas entre fontes",
            True,
        ),
    ],
)
def test_precedencia_e_pendencias(campos, motivo, pendente):
    # Arrange / Act
    resultado = classificar_encerrados([fato(**campos)], FiltroEncerramento())
    # Assert
    assert len(resultado.pendencias) == int(pendente)
    assert len(resultado.itens) == int(not pendente)
    assert (resultado.pendencias or resultado.itens)[0].motivo == motivo


def test_conclusao_fisica_datada_prevalece_sobre_prestacao_divergente_e_mantem_a_ressalva():
    # D06: divergência administrativa não tira dos concluídos quem tem conclusão física registrada.
    resultado = classificar_encerrados(
        [
            fato(
                conclusao_ativa=True,
                data_conclusao=date(2026, 1, 1),
                situacao_carteira=FECHADA,
                situacao_monitoramento="Em execução",
            )
        ],
        FiltroEncerramento(),
    )
    assert resultado.pendencias == []
    registro = resultado.itens[0]
    assert registro.motivo == "Concluído no monitoramento interno"
    assert registro.conclusao_fisica == "Registrada"
    assert registro.situacao_administrativa == "Divergência entre fontes"


@pytest.mark.parametrize(
    "campos,fisica,administrativa",
    [
        (
            {"conclusao_ativa": True, "data_conclusao": date(2026, 1, 1), "situacao_carteira": FECHADA},
            "Registrada",
            "Prestação de contas concluída",
        ),
        (
            {"conclusao_ativa": True, "data_conclusao": date(2026, 1, 1), "situacao_carteira": "Em execução"},
            "Registrada",
            "Prestação de contas pendente",
        ),
        (
            {"conclusao_ativa": True, "data_conclusao": date(2026, 1, 1)},
            "Registrada",
            "Prestação de contas sem informação",
        ),
        # encerramento administrativo sem conclusão física: a limitação fica explícita, sem presumir obra pronta
        ({"situacao_carteira": FECHADA}, "Não registrada", "Prestação de contas concluída"),
        (
            {"situacao_carteira": FECHADA, "conclusao_ativa": True},
            "Registrada sem data",
            "Prestação de contas concluída",
        ),
    ],
)
def test_duas_dimensoes_sao_informadas_separadamente(campos, fisica, administrativa):
    resultado = classificar_encerrados([fato(**campos)], FiltroEncerramento())
    registro = (resultado.itens or resultado.pendencias)[0]
    assert (registro.conclusao_fisica, registro.situacao_administrativa) == (fisica, administrativa)


@pytest.mark.parametrize(
    "status,identificador,codigo,quantidade",
    [
        ("Paga", 10, "2026001", 1),
        ("PAGA", 10, "2026001", 1),
        ("Emitida", 10, "2026001", 0),
        ("Paga", None, "2026001", 0),
        ("Paga", 10, "2026999", 0),
        ("Pago", 10, "2026001", 0),
    ],
)
def test_parceria_exige_codigo_e_evidencia_de_ordem_paga(status, identificador, codigo, quantidade):
    # Arrange
    parceria = fato(
        origem="parceria",
        tipo="Parceria TransfereGov",
        numero="2026001",
        parceria_confirmada=True,
        codigo_confirmado=codigo,
        situacao_carteira="Aprovada",
        ordens=[OrdemEncerramento(id_ordem_pagamento=identificador, in_situacao_op=status)],
    )
    # Act
    resultado = classificar_encerrados([parceria], FiltroEncerramento())
    # Assert
    assert len(resultado.itens) == quantidade
    if quantidade:
        assert resultado.itens[0].motivo == "Parceria paga"
        assert resultado.itens[0].situacao_carteira == "Aprovada"


def test_deduplica_parceria_antes_monitorada_pelo_id_da_proposta():
    # Arrange
    parceria = fato(
        origem="parceria",
        tipo="Parceria TransfereGov",
        numero="2026001",
        proposta_id=991,
        parceria_confirmada=True,
        codigo_confirmado="2026001",
        ordens=[OrdemEncerramento(id_ordem_pagamento=1, in_situacao_op="Paga")],
    )
    interno = fato(numero="991", tipo="Parceria TransfereGov", conclusao_ativa=True, data_conclusao=date(2026, 1, 1))
    # Act
    resultado = classificar_encerrados([parceria, interno, parceria], FiltroEncerramento())
    # Assert
    assert len(resultado.itens) == 1
    assert resultado.itens[0].numero == "2026001"
    assert resultado.itens[0].motivo == "Concluído no monitoramento interno"


def test_sem_data_nao_exclui_encerramento_financeiro_independente():
    # Arrange
    parceria = fato(
        origem="parceria",
        tipo="Parceria TransfereGov",
        numero="2026001",
        parceria_confirmada=True,
        codigo_confirmado="2026001",
        ordens=[OrdemEncerramento(id_ordem_pagamento=1, in_situacao_op="Paga")],
    )
    interno = fato(numero="2026001", tipo="Parceria TransfereGov", conclusao_ativa=True)
    # Act
    resultado = classificar_encerrados([interno, parceria], FiltroEncerramento())
    # Assert
    assert [i.motivo for i in resultado.itens] == ["Parceria paga"]
    assert resultado.pendencias == []


@pytest.mark.parametrize(
    "filtro",
    [
        FiltroEncerramento(uf=["SP"]),
        FiltroEncerramento(municipio="Salvador"),
        FiltroEncerramento(cnes="0000001"),
        FiltroEncerramento(ano_inicio=2026),
        FiltroEncerramento(ano_fim=2024),
        FiltroEncerramento(programa="Outro"),
        FiltroEncerramento(tipo_contratacao="TED"),
        FiltroEncerramento(situacao="Em execução"),
        FiltroEncerramento(busca="inexistente"),
    ],
)
def test_filtros_nao_reintroduzem_encerrados_fora_do_recorte(filtro):
    # Arrange / Act
    resultado = classificar_encerrados(
        [fato(situacao_carteira=FECHADA, uf="BA", municipio="Anápolis", ano=2025)], filtro
    )
    # Assert
    assert resultado.itens == [] and resultado.pendencias == []


def test_ignora_fase_inativa_e_preserva_busca_sem_acentos():
    # Arrange / Act
    resultado = classificar_encerrados(
        [fato(conclusao_ativa=False), fato(numero="999001", situacao_carteira=FECHADA, municipio="Anápolis")],
        FiltroEncerramento(municipio="ANAPOLIS"),
    )
    # Assert
    assert [i.numero for i in resultado.itens] == ["999001"]


def test_data_de_referencia_prefere_a_conclusao_do_monitoramento_e_cai_no_fim_da_vigencia():
    # Given: três situações de data para um convênio com prestação de contas concluída
    com_monitoramento = fato(
        numero="1", situacao_carteira=FECHADA, data_conclusao=date(2025, 10, 5), data_final_vigencia=date(2026, 12, 3)
    )
    so_vigencia = fato(numero="2", situacao_carteira=FECHADA, data_final_vigencia=date(2024, 6, 30))
    sem_data = fato(numero="3", situacao_carteira=FECHADA)
    # When
    extracao = classificar_encerrados([com_monitoramento, so_vigencia, sem_data], FiltroEncerramento())
    por_numero = {i.numero: i for i in extracao.itens}
    # Then: só a conclusão real ocupa a data de conclusão; o fim da vigência nunca a substitui (D07)
    assert (por_numero["1"].data_referencia, por_numero["1"].origem_data) == (
        date(2025, 10, 5),
        "Conclusão no monitoramento",
    )
    assert por_numero["1"].data_final_vigencia == date(2026, 12, 3)
    assert (por_numero["2"].data_referencia, por_numero["2"].origem_data) == (None, None)
    assert por_numero["2"].data_final_vigencia == date(2024, 6, 30)
    assert (por_numero["3"].data_referencia, por_numero["3"].origem_data) == (None, None)
    assert por_numero["3"].data_final_vigencia is None


def test_texto_de_equipamentos_mostra_a_contagem_so_quando_ha_mais_de_um():
    from app.services.relatorios_encerrados import _texto_equipamentos

    assert _texto_equipamentos([]) == ""
    assert _texto_equipamentos(["Acelerador Linear"]) == "Acelerador Linear"
    assert _texto_equipamentos(["Mamógrafo", "Acelerador Linear", "Mamógrafo"]) == "Mamógrafo (2); Acelerador Linear"


def test_quantidade_soma_o_qtd_item_dos_itens_do_tipo_inclusive_numerados():
    from app.services.relatorios_encerrados import _quantidade_de_equipamentos

    itens = [
        {"DESCRICAO_ITEM": "Mamógrafo digital", "QTD_ITEM": "2"},
        {"DESCRICAO_ITEM": "Ultrassom Diagnóstico 1", "QTD_ITEM": "1"},
        {"DESCRICAO_ITEM": "Ultrassom Diagnóstico 2", "QTD_ITEM": "3"},
        {"DESCRICAO_ITEM": "Mesa cirúrgica", "QTD_ITEM": "9"},  # não é equipamento do catálogo
    ]
    assert _quantidade_de_equipamentos(itens, ["mamografo"]) == 2
    assert _quantidade_de_equipamentos(itens, ["ultrassom"]) == 4
    assert _quantidade_de_equipamentos(itens, ["mamografo", "ultrassom"]) == 6


def test_quantidade_sem_plano_ou_sem_qtd_conta_uma_unidade_por_tipo():
    from app.services.relatorios_encerrados import _quantidade_de_equipamentos

    assert _quantidade_de_equipamentos([], ["acelerador_linear"]) == 1
    assert _quantidade_de_equipamentos([], ["mamografo", "pet_ct"]) == 2
    assert _quantidade_de_equipamentos([{"DESCRICAO_ITEM": "Mamógrafo", "QTD_ITEM": ""}], ["mamografo"]) == 1
    assert _quantidade_de_equipamentos([{"DESCRICAO_ITEM": "Mamógrafo", "QTD_ITEM": "0"}], ["mamografo"]) == 1


def test_rendimento_e_acessorio_nao_somam_unidade_na_quantidade():
    from app.services.relatorios_encerrados import _quantidade_de_equipamentos

    itens = [
        {"DESCRICAO_ITEM": "Mamógrafo digital", "QTD_ITEM": "2"},
        {"DESCRICAO_ITEM": "Utilização de rendimento de aplicação para complementar o mamógrafo", "QTD_ITEM": "1"},
    ]
    assert _quantidade_de_equipamentos(itens, ["mamografo"]) == 2
