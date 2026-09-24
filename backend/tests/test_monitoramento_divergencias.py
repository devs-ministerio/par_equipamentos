from datetime import datetime
from types import SimpleNamespace
from typing import cast

from app.db.models import PropostaCandidata
from app.services.monitoramento_divergencias import divergencia_conclusao, normalizar_status_externo


def instrumento(**overrides):
    valores = {
        "tipo_contratacao": "Convênio",
        "situacao_prestacao_contas": "Em análise",
        "situacao_ordem_pagamento_transferegov": None,
        "created_at": datetime(2026, 9, 21),
    }
    valores.update(overrides)
    return SimpleNamespace(**valores)


def test_normaliza_status_com_acentos_e_espacos():
    assert normalizar_status_externo("  Prestação  de Contas CONCLUÍDA ") == "prestacao de contas concluida"


def test_convênio_concluido_internamente_e_aberto_gera_divergencia():
    resultado = divergencia_conclusao(instrumento(), fase_concluida=True)
    assert resultado is not None
    assert resultado.fonte_externa == "Prestação de contas (SICONV/TransfereGov legado)"
    assert resultado.status_externo_original == "Em análise"


def test_convênio_com_prestacao_concluida_nao_gera_divergencia():
    resultado = divergencia_conclusao(
        instrumento(situacao_prestacao_contas="Prestação de Contas Concluída"),
        fase_concluida=True,
    )
    assert resultado is None


def test_proposta_paga_nao_gera_divergencia():
    proposta = SimpleNamespace(situacao_proposta="Pago", created_at=datetime(2026, 9, 21))
    resultado = divergencia_conclusao(
        instrumento(tipo_contratacao="Parceria TransfereGov", situacao_prestacao_contas=None),
        fase_concluida=True,
        proposta=cast(PropostaCandidata, proposta),
    )
    assert resultado is None


def test_proposta_aberta_gera_divergencia():
    proposta = SimpleNamespace(situacao_proposta="Em análise", created_at=datetime(2026, 9, 21))
    resultado = divergencia_conclusao(
        instrumento(tipo_contratacao="Parceria TransfereGov", situacao_prestacao_contas=None),
        fase_concluida=True,
        proposta=cast(PropostaCandidata, proposta),
    )
    assert resultado is not None
    assert resultado.fonte_externa == "Proposta TransfereGov"


def test_carga_manual_sem_fonte_externa_nao_gera_divergencia():
    resultado = divergencia_conclusao(
        instrumento(tipo_contratacao="FAF", situacao_prestacao_contas=None),
        fase_concluida=True,
    )
    assert resultado is None
