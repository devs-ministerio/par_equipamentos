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
            "Concluído internamente — prestação de contas sem informação",
            False,
        ),
        (
            {"conclusao_ativa": True, "data_conclusao": date(2026, 1, 1), "situacao_carteira": "Em execução"},
            "Concluído internamente — prestação de contas pendente",
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
