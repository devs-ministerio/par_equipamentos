"""Regressões de contratos recuperados; não representam aprovação operacional."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas_aprovacao_legado import AprovacaoLegadoCreate
from app.schemas_captura_legado import CapturaLegadoBasica
from app.schemas_programas_legado import ProgramasLegadoRecapturados


@pytest.fixture
def payload():
    return {
        "convenio": {
            "NR_CONVENIO": "999001",
            "ID_PROPOSTA": "111001",
            "SIT_CONVENIO": "Em execução",
            "VL_GLOBAL_CONV": "1000,50",
        },
        "itens": [
            {
                "ID_PROPOSTA": "111001",
                "ID_ITEM_PAD": "1",
                "DESCRICAO_ITEM": "Aquisição de mamógrafo",
                "VALOR_TOTAL_ITEM": "1000,50",
            }
        ],
    }


@pytest.mark.parametrize("valor", ["-1", "NaN", "Infinity", "-Infinity", "texto", "1.000,50", ""])
def test_recaptura_rejeita_valor_oficial_invalido_sem_converter_em_zero(payload, valor):
    payload["convenio"]["VL_GLOBAL_CONV"] = valor
    with pytest.raises(ValidationError, match="Valor global"):
        CapturaLegadoBasica.model_validate(payload)


@pytest.mark.parametrize("campo", ["NR_CONVENIO", "ID_PROPOSTA", "SIT_CONVENIO", "VL_GLOBAL_CONV"])
def test_recaptura_nao_aceita_campo_obrigatorio_omitido(payload, campo):
    del payload["convenio"][campo]
    with pytest.raises(ValidationError):
        CapturaLegadoBasica.model_validate(payload)


def test_zero_e_campos_oficiais_adicionais_preservados(payload):
    payload["convenio"]["VL_GLOBAL_CONV"] = "0"
    payload["convenio"]["SITUACAO_PRESTACAO_CONTAS"] = "Prestação de Contas Concluída"
    captura = CapturaLegadoBasica.model_validate(payload)
    saida = captura.model_dump(mode="json")
    assert saida["convenio"]["VL_GLOBAL_CONV"] == "0"
    assert saida["convenio"]["SITUACAO_PRESTACAO_CONTAS"] == "Prestação de Contas Concluída"
    assert saida["itens"][0]["VALOR_TOTAL_ITEM"] == "1000,50"


@pytest.mark.parametrize("defeito", ["outra_proposta", "duplicado", "vazio", "situacao_em_branco"])
def test_recaptura_rejeita_prova_incoerente(payload, defeito):
    if defeito == "outra_proposta":
        payload["itens"][0]["ID_PROPOSTA"] = "111002"
    elif defeito == "duplicado":
        payload["itens"].append(dict(payload["itens"][0]))
    elif defeito == "vazio":
        payload["itens"] = []
    else:
        payload["convenio"]["SIT_CONVENIO"] = "  "
    with pytest.raises(ValidationError):
        CapturaLegadoBasica.model_validate(payload)


def test_programas_podem_ser_alternativa_sem_fabricar_item(payload):
    payload["itens"] = []
    payload["programas"] = {
        "vinculos": [{"ID_PROPOSTA": "111001", "ID_PROGRAMA": "10"}],
        "catalogo": [{"ID_PROGRAMA": "10", "NOME_PROGRAMA": "Programa oficial", "COD_ORGAO_SUP_PROGRAMA": "36000"}],
    }
    captura = CapturaLegadoBasica.model_validate(payload)
    assert captura.itens == ()
    assert captura.programas is not None
    assert captura.programas.model_dump()["catalogo"][0]["COD_ORGAO_SUP_PROGRAMA"] == "36000"
    # Presença do programa não implica prioridade nem autorização para aprovar.
    payload["programas"]["vinculos"][0]["ID_PROPOSTA"] = "111002"
    with pytest.raises(ValidationError, match="outra proposta"):
        CapturaLegadoBasica.model_validate(payload)


@pytest.mark.parametrize("defeito", ["duplicado", "catalogo_ausente", "catalogo_alheio"])
def test_programa_nao_e_associado_por_nome_ou_catalogo_incompleto(defeito):
    dados = {
        "vinculos": [{"ID_PROPOSTA": "1", "ID_PROGRAMA": "2"}],
        "catalogo": [{"ID_PROGRAMA": "2", "NOME_PROGRAMA": "Programa oficial"}],
    }
    if defeito == "duplicado":
        dados["vinculos"].append(dict(dados["vinculos"][0]))
    elif defeito == "catalogo_ausente":
        dados["catalogo"] = []
    else:
        dados["catalogo"][0]["ID_PROGRAMA"] = "3"
    with pytest.raises(ValidationError):
        ProgramasLegadoRecapturados.model_validate(dados)


@pytest.fixture
def pedido():
    return {
        "chave": str(uuid4()),
        "captura_id": 1,
        "recaptura_id": 2,
        "hash_revisado": "a" * 64,
        "versao": 0,
        "justificativa": "  Evidência revisada pela equipe  ",
    }


def test_pedido_aprovacao_contem_so_referencias_e_justificativa(pedido):
    aprovado = AprovacaoLegadoCreate.model_validate(pedido)
    assert aprovado.justificativa == "Evidência revisada pela equipe"
    assert set(aprovado.model_dump()) == set(pedido)


@pytest.mark.parametrize(
    "campo,valor",
    [
        ("captura_id", 0),
        ("recaptura_id", -1),
        ("versao", -1),
        ("captura_id", True),
        ("recaptura_id", "2"),
        ("versao", False),
        ("hash_revisado", "A" * 64),
        ("hash_revisado", "a" * 63),
        ("justificativa", "  "),
        ("chave", "sem-chave"),
    ],
)
def test_pedido_aprovacao_rejeita_referencias_e_formatos_invalidos(pedido, campo, valor):
    pedido[campo] = valor
    with pytest.raises(ValidationError):
        AprovacaoLegadoCreate.model_validate(pedido)


@pytest.mark.parametrize("campo", ["payload_oficial", "situacao", "usuario_id", "valor_global", "capturado_em"])
def test_navegador_nao_pode_fornecer_prova_ou_identidade_do_aprovador(pedido, campo):
    pedido[campo] = "forjado"
    with pytest.raises(ValidationError):
        AprovacaoLegadoCreate.model_validate(pedido)
