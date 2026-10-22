"""Prova institucional, celebração e classificação sem rede nem banco."""

import pytest
from pydantic import ValidationError

from app.catalogo_componentes import COMPONENTES_ALVO
from app.schemas_escopo_descoberta import ComponenteDescoberto
from app.services.descoberta_prioritaria_ms import descobrir_prioritarios_ms


def descobrir(
    descricao="010933-Acelerador Linear de uso médico", orgao="36000", programas=(), vinculos=(), celebracao=None
):
    return descobrir_prioritarios_ms(
        convenios=[
            {
                "NR_CONVENIO": "900000001",
                "ID_PROPOSTA": "1",
                **(
                    {"DIA_ASSIN_CONV": "01/01/2025", "DIA_PUBL_CONV": "02/01/2025", "SIT_CONVENIO": "Em execução"}
                    if celebracao is None
                    else celebracao
                ),
            }
        ],
        itens=[{"ID_PROPOSTA": "1", "ID_ITEM_PAD": "10", "DESCRICAO_ITEM": descricao}],
        propostas=[{"ID_PROPOSTA": "1", "COD_ORGAO_SUP": orgao}],
        programas=programas,
        vinculos=vinculos,
        conhecidos=set(),
        limite=100,
    )


@pytest.mark.parametrize(
    "descricao",
    [
        "Consultoria: atendimento ao vencedor do acelerador de empreendimento",
        "Capital semente: incentivo ao acelerador de empreendimento",
        "Compra de cadeira",
        "Construção de hospital com salas de tomografia, Acelerador Linear e Braquiterapia",
        "Manutenção de acelerador linear",
        "Aquisição de acessórios para acelerador linear",
        "Acelerador linear existente",
        "Aquisição de ultrassom",
        "Curso de operação de Acelerador Linear",
        "Capacitação em braquiterapia",
        "Consultoria - atendimento ao vencedor do acelerador de empreendimento",
        "Capital semente - incentivo aos participantes com recurso acelerador",
    ],
)
def test_contexto_servico_obra_e_item_nao_prioritario_nao_entram(descricao):
    assert descobrir(descricao) == []


def test_item_explicito_exige_ms_e_preserva_prova_celebracao():
    candidato = descobrir()[0]
    assert candidato.criterio_escopo == "prioritarios_ms_celebrados_v2"
    assert candidato.evidencias[0].codigo_equipamento == "acelerador_linear"
    assert candidato.componentes == ()
    assert candidato.data_assinatura_siconv.isoformat() == "2025-01-01"
    assert descobrir(orgao="51000") == []


def test_componente_exato_vinculado_autoriza_sem_inventar_equipamento():
    programas = [{"ID_PROGRAMA": "2", "COD_ORGAO_SUP_PROGRAMA": "36000", "NOME_PROGRAMA": COMPONENTES_ALVO[0]}]
    vinculos = [{"ID_PROPOSTA": "1", "ID_PROGRAMA": "2"}]
    candidato = descobrir("Compra de cadeira", programas=programas, vinculos=vinculos)[0]
    assert candidato.evidencias == ()
    assert candidato.componentes[0].id_programa == "2"
    assert candidato.componentes[0].componente == COMPONENTES_ALVO[0]
    assert descobrir("Compra de cadeira", orgao="51000", programas=programas, vinculos=vinculos) == []
    assert descobrir("Compra de cadeira", programas=programas) == []
    assert (
        descobrir(
            "Compra de cadeira", programas=[{**programas[0], "COD_ORGAO_SUP_PROGRAMA": "51000"}], vinculos=vinculos
        )
        == []
    )


@pytest.mark.parametrize("descricao", ["Curso de operação de LINAC", "Capacitação em Mamógrafo"])
def test_componente_nao_sobrepoe_item_exclusivamente_formativo(descricao):
    programas = [{"ID_PROGRAMA": "2", "COD_ORGAO_SUP_PROGRAMA": "36000", "NOME_PROGRAMA": COMPONENTES_ALVO[0]}]
    vinculos = [{"ID_PROPOSTA": "1", "ID_PROGRAMA": "2"}]
    assert descobrir(descricao, programas=programas, vinculos=vinculos) == []


def test_aquisicao_com_treinamento_incluso_permanece_elegivel():
    candidato = descobrir("Aquisição de Acelerador Linear com treinamento operacional incluso")[0]
    assert candidato.evidencias[0].codigo_equipamento == "acelerador_linear"


def test_componente_com_sufixo_nao_casa_por_aproximacao():
    programas = [{"ID_PROGRAMA": "2", "COD_ORGAO_SUP_PROGRAMA": "36000", "NOME_PROGRAMA": COMPONENTES_ALVO[0]}]
    vinculos = [{"ID_PROPOSTA": "1", "ID_PROGRAMA": "2"}]
    assert (
        descobrir(
            "Compra de cadeira",
            programas=[{**programas[0], "NOME_PROGRAMA": COMPONENTES_ALVO[0] + " - OBRAS"}],
            vinculos=vinculos,
        )
        == []
    )


@pytest.mark.parametrize(
    "celebracao",
    [
        {"DIA_ASSIN_CONV": "", "DIA_PUBL_CONV": "", "SIT_CONVENIO": "Proposta/Plano de Trabalho Aprovado"},
        {"DIA_ASSIN_CONV": "", "DIA_PUBL_CONV": "", "SIT_CONVENIO": ""},
        {"DIA_ASSIN_CONV": "01/01/2025", "DIA_PUBL_CONV": "", "SIT_CONVENIO": "Em execução"},
        {"DIA_ASSIN_CONV": "", "DIA_PUBL_CONV": "02/01/2025", "SIT_CONVENIO": "Em execução"},
        {
            "DIA_ASSIN_CONV": "01/01/2025",
            "DIA_PUBL_CONV": "02/01/2025",
            "SIT_CONVENIO": "Proposta/Plano de Trabalho Aprovado",
        },
    ],
)
def test_numero_reservado_ou_proposta_nao_entra_como_convenio(celebracao):
    assert descobrir(celebracao=celebracao) == []


@pytest.mark.parametrize("assinatura", ["31/02/2025", "texto", "2025-01-01"])
def test_data_oficial_malformada_aborta_rodada(assinatura):
    with pytest.raises(ValidationError):
        descobrir(
            celebracao={"DIA_ASSIN_CONV": assinatura, "DIA_PUBL_CONV": "02/01/2025", "SIT_CONVENIO": "Em execução"}
        )


def test_cabecalho_sem_prova_celebracao_nao_aceito():
    with pytest.raises(ValidationError):
        descobrir(celebracao={})


@pytest.mark.parametrize("limite", [0, 1001, True])
def test_limite_invalido_recusado_antes_de_consumir_fontes(limite):
    def fonte():
        raise AssertionError("Não deveria consumir a fonte")
        yield {}

    with pytest.raises(ValueError, match="entre 1 e 1000"):
        descobrir_prioritarios_ms(
            convenios=fonte(), itens=(), propostas=(), programas=(), vinculos=(), conhecidos=set(), limite=limite
        )


def test_identidade_divergente_aborta_em_vez_de_associar_equipamento_errado():
    convenios = [
        {
            "NR_CONVENIO": n,
            "ID_PROPOSTA": "1",
            "DIA_ASSIN_CONV": "01/01/2025",
            "DIA_PUBL_CONV": "02/01/2025",
            "SIT_CONVENIO": "Em execução",
        }
        for n in ("1", "2")
    ]
    with pytest.raises(ValueError, match="múltiplos"):
        descobrir_prioritarios_ms(
            convenios=convenios, itens=(), propostas=(), programas=(), vinculos=(), conhecidos=set()
        )


def test_nome_generico_nao_pode_receber_componente_prioritario_por_copia():
    with pytest.raises(ValidationError, match="nome integral"):
        ComponenteDescoberto(id_programa="1", nome_programa="Programa genérico", componente=COMPONENTES_ALVO[0])
