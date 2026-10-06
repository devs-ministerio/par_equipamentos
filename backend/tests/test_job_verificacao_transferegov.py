"""Regressões da reconciliação de situações do TransfereGov novo."""

from types import SimpleNamespace
from typing import cast

from app.db.models import InstrumentoEquipamento
from scripts.job_verificacao_transferegov import reconciliar_situacoes, resumo_mudancas


def instrumento_teste(parceria: str | None, ordem: str | None) -> InstrumentoEquipamento:
    return cast(
        InstrumentoEquipamento,
        SimpleNamespace(
            situacao_parceria_transferegov=parceria,
            situacao_ordem_pagamento_transferegov=ordem,
        ),
    )


def test_resposta_sem_parceria_nao_apaga_estados_conhecidos():
    instrumento = instrumento_teste("Aprovada", "Paga")

    mudancas = reconciliar_situacoes(instrumento, None, None)

    assert mudancas == {}
    assert instrumento.situacao_parceria_transferegov == "Aprovada"
    assert instrumento.situacao_ordem_pagamento_transferegov == "Paga"


def test_ausencia_de_ordem_nao_apaga_pagamento_enquanto_parceria_muda():
    instrumento = instrumento_teste("Aprovada", "Paga")

    mudancas = reconciliar_situacoes(instrumento, "Em Execução", None)

    assert mudancas == {"situacao_parceria_transferegov": {"old": "Aprovada", "new": "Em Execução"}}
    assert instrumento.situacao_parceria_transferegov == "Em Execução"
    assert instrumento.situacao_ordem_pagamento_transferegov == "Paga"


def test_duas_mudancas_sao_agrupadas_e_reexecucao_e_idempotente():
    instrumento = instrumento_teste("Aprovada", "Emitida")

    mudancas = reconciliar_situacoes(instrumento, "Em Execução", "Paga")

    assert set(mudancas) == {
        "situacao_parceria_transferegov",
        "situacao_ordem_pagamento_transferegov",
    }
    assert resumo_mudancas(mudancas) == (
        "Situação da parceria: Aprovada → Em Execução; Ordem de pagamento: Emitida → Paga"
    )
    assert reconciliar_situacoes(instrumento, "Em Execução", "Paga") == {}
