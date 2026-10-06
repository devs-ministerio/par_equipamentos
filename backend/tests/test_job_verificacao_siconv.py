"""Regressões do espelho SICONV, incluindo o caso real 825374."""

from types import SimpleNamespace
from typing import cast

from app.db.models import Convenio, InstrumentoEquipamento
from scripts.job_verificacao_siconv import reconciliar_situacao


def test_825374_preenche_monitoramento_sem_inventar_mudanca_na_fonte():
    convenio = cast(Convenio, SimpleNamespace(situacao="Prestação de Contas Concluída"))
    instrumento = cast(InstrumentoEquipamento, SimpleNamespace(situacao_prestacao_contas=None))

    fonte_mudou, instrumento_mudou = reconciliar_situacao(
        convenio, instrumento, "Prestação de Contas Concluída"
    )

    assert (fonte_mudou, instrumento_mudou) == (False, True)
    assert instrumento.situacao_prestacao_contas == convenio.situacao


def test_status_novo_atualiza_as_duas_visoes():
    convenio = cast(Convenio, SimpleNamespace(situacao="Em execução"))
    instrumento = cast(InstrumentoEquipamento, SimpleNamespace(situacao_prestacao_contas="Em execução"))

    assert reconciliar_situacao(convenio, instrumento, "Prestação de Contas Concluída") == (True, True)
    assert convenio.situacao == instrumento.situacao_prestacao_contas == "Prestação de Contas Concluída"


def test_ausencia_na_fonte_nao_apaga_status_conhecido():
    convenio = cast(Convenio, SimpleNamespace(situacao="Prestação de Contas Concluída"))
    instrumento = cast(
        InstrumentoEquipamento,
        SimpleNamespace(situacao_prestacao_contas="Prestação de Contas Concluída"),
    )

    assert reconciliar_situacao(convenio, instrumento, None) == (False, False)
    assert convenio.situacao == instrumento.situacao_prestacao_contas


def test_reexecucao_nao_cria_nova_mudanca():
    convenio = cast(Convenio, SimpleNamespace(situacao="Prestação de Contas Concluída"))
    instrumento = cast(
        InstrumentoEquipamento,
        SimpleNamespace(situacao_prestacao_contas="Prestação de Contas Concluída"),
    )

    assert reconciliar_situacao(convenio, instrumento, "Prestação de Contas Concluída") == (False, False)
