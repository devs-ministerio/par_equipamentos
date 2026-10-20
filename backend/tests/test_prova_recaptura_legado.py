"""Prova pura de recaptura e frescor; nenhuma promoção real é executada."""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.catalogo_componentes import COMPONENTES_ALVO
from app.domain_errors import ConflictError
from app.schemas_filhas_legado import CHAVES_FILHAS, FilhasLegadoRecapturadas
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao, OrigemRecapturaColetada
from app.services.descoberta_prioritaria_ms import descobrir_prioritarios_ms
from app.services.prova_recaptura_legado import (
    hash_captura_promocao,
    validar_captura_promocao,
    validar_frescor_recaptura,
)


@pytest.fixture
def dados():
    return {
        "convenio": {
            "NR_CONVENIO": "999001",
            "ID_PROPOSTA": "111001",
            "SIT_CONVENIO": "Em execução",
            "VL_GLOBAL_CONV": "1000,50",
            "DIA_ASSIN_CONV": "01/10/2026",
            "DIA_PUBL_CONV": "02/10/2026",
        },
        "itens": [{"ID_PROPOSTA": "111001", "ID_ITEM_PAD": "1", "DESCRICAO_ITEM": "Aquisição de mamógrafo"}],
        "filhas": {campo: [] for campo in CHAVES_FILHAS},
        "programas": {"vinculos": [], "catalogo": []},
        "proposta": {"ID_PROPOSTA": "111001", "COD_ORGAO_SUP": "36000"},
        "portal": {
            "dimConvenio": {"codigo": 999001, "numero": "999001/2026", "objeto": "Aquisição de equipamentos"},
            "convenente": {"nome": "Instituição sintética", "cnpjFormatado": "00.000.000/0001-00"},
            "municipioConvenente": {"nomeIBGE": "Cidade sintética", "uf": {"nome": "BA"}},
            "dataPublicacao": "02/10/2026",
        },
    }


def candidato(dados):
    encontrado = descobrir_prioritarios_ms(
        convenios=[dados["convenio"]],
        itens=dados["itens"],
        propostas=[dados["proposta"]],
        programas=dados["programas"]["catalogo"],
        vinculos=dados["programas"]["vinculos"],
        conhecidos=set(),
    )[0]
    return encontrado.model_copy(
        update={"confirmacao_portal": "confirmado", "data_publicacao": datetime(2026, 10, 2).date()}
    )


def test_prova_coerente_preserva_zero_e_nao_exige_registros_financeiros_inexistentes(dados):
    dados["convenio"]["VL_GLOBAL_CONV"] = "0"
    captura = CapturaLegadoParaPromocao.model_validate(dados)
    validar_captura_promocao(candidato=candidato(dados), captura=captura, hash_revisado=hash_captura_promocao(captura))
    assert captura.convenio.VL_GLOBAL_CONV == "0" and captura.filhas.pagamentos == ()


@pytest.mark.parametrize("campo", ["portal", "filhas", "programas", "proposta"])
def test_prova_completa_nao_aceita_fonte_omitida(dados, campo):
    del dados[campo]
    with pytest.raises(ValidationError):
        CapturaLegadoParaPromocao.model_validate(dados)


@pytest.mark.parametrize("campo", list(CHAVES_FILHAS))
def test_tabela_vazia_e_obrigatoria_mesmo_sem_registros(dados, campo):
    del dados["filhas"][campo]
    with pytest.raises(ValidationError):
        CapturaLegadoParaPromocao.model_validate(dados)


@pytest.mark.parametrize("defeito", ["portal", "proposta", "pagamento"])
def test_prova_rejeita_identidade_alheia(dados, defeito):
    if defeito == "portal":
        dados["portal"]["dimConvenio"]["codigo"] = 999002
    elif defeito == "proposta":
        dados["proposta"]["ID_PROPOSTA"] = "111002"
    else:
        dados["filhas"]["pagamentos"] = [{"NR_CONVENIO": "999002", "NR_MOV_FIN": "1", "VL_PAGO": "10"}]
    with pytest.raises(ValidationError):
        CapturaLegadoParaPromocao.model_validate(dados)


def test_chave_aditivo_distingue_termos_da_mesma_solicitacao_e_preserva_estorno(dados):
    dados["filhas"]["termos_aditivos"] = [
        {"NR_CONVENIO": "999001", "ID_SOLICITACAO": "10", "NUMERO_TA": n} for n in ("1", "2")
    ]
    dados["filhas"]["pagamentos"] = [{"NR_CONVENIO": "999001", "NR_MOV_FIN": "1", "VL_PAGO": "-10,50"}]
    filhas = FilhasLegadoRecapturadas.model_validate(dados["filhas"])
    assert {t.CHAVE_ESPELHO for t in filhas.termos_aditivos} == {
        "solicitacao:10|numero_ta:1",
        "solicitacao:10|numero_ta:2",
    }
    assert filhas.pagamentos[0].VL_PAGO == "-10,50"
    dados["filhas"]["termos_aditivos"].append(dict(dados["filhas"]["termos_aditivos"][0]))
    with pytest.raises(ValidationError, match="duplicada"):
        FilhasLegadoRecapturadas.model_validate(dados["filhas"])


@pytest.mark.parametrize("valor", ["NaN", "Infinity", "texto"])
def test_pagamento_invalido_nao_e_convertido_em_zero(dados, valor):
    dados["filhas"]["pagamentos"] = [{"NR_CONVENIO": "999001", "NR_MOV_FIN": "1", "VL_PAGO": valor}]
    with pytest.raises(ValidationError):
        FilhasLegadoRecapturadas.model_validate(dados["filhas"])


@pytest.mark.parametrize(
    "idade,aceito",
    [
        (timedelta(0), True),
        (timedelta(hours=24), True),
        (timedelta(hours=24, microseconds=1), False),
        (timedelta(seconds=-1), False),
    ],
)
def test_frescor_24_horas_com_limite_e_horario_futuro(idade, aceito):
    agora = datetime(2026, 10, 13, tzinfo=UTC)
    if aceito:
        validar_frescor_recaptura(capturado_em=agora - idade, agora=agora)
    else:
        with pytest.raises(ConflictError):
            validar_frescor_recaptura(capturado_em=agora - idade, agora=agora)


def test_frescor_sem_fuso_recusado():
    with pytest.raises(ConflictError):
        validar_frescor_recaptura(capturado_em=datetime(2026, 10, 13), agora=datetime(2026, 10, 13, tzinfo=UTC))


@pytest.mark.parametrize("hash_errado", ["a" * 64, "é" * 64])
def test_hash_nao_revisado_recusado(dados, hash_errado):
    captura = CapturaLegadoParaPromocao.model_validate(dados)
    with pytest.raises(ConflictError):
        validar_captura_promocao(candidato=candidato(dados), captura=captura, hash_revisado=hash_errado)


@pytest.mark.parametrize("alteracao", ["ministerio", "obra", "curso", "publicacao", "assinatura"])
def test_prova_alterada_exige_revisao_mesmo_com_hash_novo(dados, alteracao):
    revisado = candidato(dados)
    if alteracao == "ministerio":
        dados["proposta"]["COD_ORGAO_SUP"] = "51000"
    elif alteracao == "obra":
        dados["itens"][0]["DESCRICAO_ITEM"] = "Construção de hospital com salas de mamografia"
    elif alteracao == "curso":
        dados["itens"][0]["DESCRICAO_ITEM"] = "Curso de operação de Mamógrafo"
    elif alteracao == "publicacao":
        dados["portal"]["dataPublicacao"] = "03/10/2026"
    else:
        dados["convenio"]["DIA_ASSIN_CONV"] = "03/10/2026"
    captura = CapturaLegadoParaPromocao.model_validate(dados)
    with pytest.raises(ConflictError):
        validar_captura_promocao(candidato=revisado, captura=captura, hash_revisado=hash_captura_promocao(captura))


def test_obra_nao_entra_no_radar_por_componente_prioritario(dados):
    dados["itens"][0]["DESCRICAO_ITEM"] = "Construção de hospital com salas de mamografia"
    dados["programas"] = {
        "vinculos": [{"ID_PROPOSTA": "111001", "ID_PROGRAMA": "10"}],
        "catalogo": [{"ID_PROGRAMA": "10", "NOME_PROGRAMA": COMPONENTES_ALVO[0], "COD_ORGAO_SUP_PROGRAMA": "36000"}],
    }
    assert (
        descobrir_prioritarios_ms(
            convenios=[dados["convenio"]],
            itens=dados["itens"],
            propostas=[dados["proposta"]],
            programas=dados["programas"]["catalogo"],
            vinculos=dados["programas"]["vinculos"],
            conhecidos=set(),
        )
        == []
    )


def test_hash_considera_campos_oficiais_adicionais(dados):
    antes = hash_captura_promocao(CapturaLegadoParaPromocao.model_validate(dados))
    dados["convenio"]["SITUACAO_PRESTACAO_CONTAS"] = "Prestação de Contas Concluída"
    assert hash_captura_promocao(CapturaLegadoParaPromocao.model_validate(dados)) != antes


def test_hashes_da_rodada_exigem_todas_as_fontes():
    hashes_filhas = {c: "d" * 64 for c in CHAVES_FILHAS}
    origem = {
        "iniciado_em": datetime(2026, 10, 13, tzinfo=UTC),
        "hash_convenios": "a" * 64,
        "hash_itens": "b" * 64,
        "hash_proposta": "c" * 64,
        "hashes_filhas": hashes_filhas,
        "hashes_programas": {c: "e" * 64 for c in ("siconv_programa", "siconv_programa_proposta")},
    }
    assert OrigemRecapturaColetada.model_validate(origem)
    del hashes_filhas["pagamentos"]
    with pytest.raises(ValidationError, match="Hashes"):
        OrigemRecapturaColetada.model_validate(origem)
