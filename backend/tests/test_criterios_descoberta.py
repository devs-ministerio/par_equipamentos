"""Regressões sintéticas do escopo prioritário; sem consultar fonte externa."""

import pytest

from app.catalogo_componentes import ALIASES_COMPONENTES, COMPONENTES_ALVO
from app.services.criterios_descoberta import componente_prioritario, equipamentos_prioritarios_do_item


@pytest.mark.parametrize(
    "descricao",
    [
        "Obras de construção do Hospital Regional com radioterapia, Acelerador Linear e Braquiterapia",
        "Hospital com área construída de 23.262 m², salas de mamografia e Acelerador Linear",
        "Contratação de empresa para execução das obras de construção do Hospital Regional de Alagoinhas",
        "Manutenção de Acelerador Linear",
        "Aquisição de aplicador de braquiterapia",
        "Locação de Mamógrafo",
        "Equipamento existente: LINAC",
        "Compra de tomógrafo",
        "Consultoria - atendimento ao vencedor do acelerador de empreendimento",
        "Capital semente - incentivo aos participantes com recurso acelerador",
        "Curso de operação de Acelerador Linear",
        "Realização de capacitação em braquiterapia",
        "Aquisição de curso de operação de LINAC",
        "Curso sobre aquisição de equipamento de braquiterapia",
        "Serviço educacional: treinamento em Mamógrafo",
        "010911-Treinamento em PET-CT",
        "Formação profissional em radioterapia com acelerador linear",
        "Programa acelerador de negócios",
    ],
)
def test_narrativa_de_obra_servico_acessorio_e_nao_prioritario_nao_comprova_equipamento(descricao):
    # Arrange / Act
    identificados = equipamentos_prioritarios_do_item(descricao)
    # Assert
    assert identificados == set()


@pytest.mark.parametrize(
    "descricao,codigo",
    [
        ("Aquisição de Acelerador Linear", "acelerador_linear"),
        ("010911-Mamógrafo", "mamografo"),
        ("Aquisição de PET-CT", "pet_ct"),
        ("Aquisição de equipamento de braquiterapia", "braquiterapia"),
        ("Aquisição de Acelerador Linear com treinamento operacional incluso", "acelerador_linear"),
        ("Fornecimento de Mamógrafo com capacitação da equipe", "mamografo"),
        ("Aquisição de equipamento de braquiterapia com curso de operação", "braquiterapia"),
        ("010911-Acelerador Linear com treinamento incluso", "acelerador_linear"),
        ("Mamógrafo incluindo capacitação da equipe", "mamografo"),
    ],
)
def test_item_prioritario_expresso_preserva_identificacao(descricao, codigo):
    # Arrange / Act / Assert
    assert equipamentos_prioritarios_do_item(descricao) == {codigo}


def test_componente_casa_nome_integral_e_alias_explicito_sem_fuzzy_match():
    # Arrange
    nome = COMPONENTES_ALVO[0]
    # Act / Assert
    assert componente_prioritario(nome.lower()) == nome
    assert componente_prioritario("ATENCAO ESPECIALIZADA EM SAUDE - " + nome) == nome
    assert componente_prioritario("Programa de oncologia") is None
    assert componente_prioritario(nome + " - reforma de hospital") is None
    for alias, canonico in ALIASES_COMPONENTES.items():
        assert componente_prioritario(alias) == canonico
