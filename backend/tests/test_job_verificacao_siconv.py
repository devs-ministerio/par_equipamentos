"""Regressões do espelho SICONV, incluindo o caso real 825374."""

from types import SimpleNamespace
from typing import cast

from app.db.models import Convenio, InstrumentoEquipamento
from scripts.job_verificacao_siconv import comparar_campos_oficiais, reconciliar_situacao, resumo_campos


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


def test_diff_agrupa_todos_os_campos_do_registro_principal():
    anterior = {
        "SIT_CONVENIO": "Em execução",
        "VL_GLOBAL_CONV": "100,00",
        "DIA_FIM_VIGENC_CONV": "20261031",
    }
    novo = {
        "SIT_CONVENIO": "Prestação de Contas Concluída",
        "VL_GLOBAL_CONV": "150,00",
        "DIA_FIM_VIGENC_CONV": "20261231",
    }

    mudancas = comparar_campos_oficiais(anterior, novo)

    assert len(mudancas) == 3
    assert "VL_GLOBAL_CONV: 100,00 → 150,00" in resumo_campos(mudancas)
    assert comparar_campos_oficiais(novo, novo) == {}


def test_primeira_captura_nao_gera_aviso_historico():
    assert comparar_campos_oficiais(None, {"SIT_CONVENIO": "Concluída"}) == {}
