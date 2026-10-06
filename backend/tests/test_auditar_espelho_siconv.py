"""Auditoria read-only detecta o caso 825374 e ausência de fonte."""

from types import SimpleNamespace
from typing import cast

from app.db.models import Convenio, InstrumentoEquipamento
from scripts.auditar_espelho_siconv import comparar_situacoes


def test_detecta_status_na_visao_oficial_mas_ausente_no_monitoramento():
    convenio = cast(
        Convenio,
        SimpleNamespace(
            numero="825374",
            situacao="Prestação de Contas Concluída",
            siconv_raw={"convenio": {"NR_CONVENIO": "825374", "SIT_CONVENIO": "Prestação de Contas Concluída"}},
        ),
    )
    instrumento = cast(
        InstrumentoEquipamento,
        SimpleNamespace(nr_convenio="825374", situacao_prestacao_contas=None),
    )

    divergencias = comparar_situacoes(
        [convenio],
        [instrumento],
        [{"NR_CONVENIO": "825374", "SIT_CONVENIO": "Prestação de Contas Concluída"}],
    )

    assert len(divergencias) == 1
    assert divergencias[0].tipo == "monitoramento"
    assert divergencias[0].valor_local is None


def test_ausencia_no_dump_nao_e_tratada_como_conclusao_pendente():
    convenio = cast(Convenio, SimpleNamespace(numero="825374", situacao="Prestação de Contas Concluída"))

    divergencias = comparar_situacoes([convenio], [], [])

    assert len(divergencias) == 1
    assert divergencias[0].tipo == "ausente_no_dump"


def test_espelho_integral_nao_tem_divergencia():
    convenio = cast(
        Convenio,
        SimpleNamespace(
            numero="825374",
            situacao="Prestação de Contas Concluída",
            siconv_raw={"convenio": {"NR_CONVENIO": "825374", "SIT_CONVENIO": "Prestação de Contas Concluída"}},
        ),
    )
    instrumento = cast(
        InstrumentoEquipamento,
        SimpleNamespace(nr_convenio="825374", situacao_prestacao_contas="Prestação de Contas Concluída"),
    )

    assert comparar_situacoes(
        [convenio],
        [instrumento],
        [{"NR_CONVENIO": "825374", "SIT_CONVENIO": "Prestação de Contas Concluída"}],
    ) == []


def test_detecta_campo_financeiro_desatualizado_no_snapshot():
    convenio = cast(
        Convenio,
        SimpleNamespace(
            numero="825374",
            situacao="Prestação de Contas Concluída",
            siconv_raw={"convenio": {"NR_CONVENIO": "825374", "SIT_CONVENIO": "Prestação de Contas Concluída", "VL_GLOBAL_CONV": "100,00"}},
        ),
    )

    divergencias = comparar_situacoes(
        [convenio],
        [],
        [{"NR_CONVENIO": "825374", "SIT_CONVENIO": "Prestação de Contas Concluída", "VL_GLOBAL_CONV": "150,00"}],
    )

    assert len(divergencias) == 1
    assert divergencias[0].tipo == "campo:VL_GLOBAL_CONV"
