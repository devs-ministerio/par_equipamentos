"""Montagem do Excel do relatório de instrumentos e repasse.

Parte do pacote de relatórios; a fachada pública é `app.services.relatorios`.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.reports import xlsx_builder
from app.services.relatorios_filtro import FiltroRelatorio, Nivel
from app.services.relatorios_merito import _linhas_leitura
from app.services.relatorios_recorte import _convenios, _instrumentos, _propostas
from app.services.relatorios_tabelas import (
    _DATA_CONVENIO_COMPLETO,
    _DATA_MONITORAMENTO_TIMELINE,
    _DATA_PROPOSTA,
    _MOEDA_CONVENIO_COMPLETO,
    _MOEDA_CONVENIO_SIMPLIFICADO,
    _MOEDA_PROPOSTA,
    _carregar_equipamentos_por_convenio,
    _entregues_por_convenio,
    _resumo_equipamentos,
    _resumo_instrumentos_programas,
    _resumo_propostas,
    _tabela_convenios,
    _tabela_monitoramento_simplificado,
    _tabela_monitoramento_timeline,
    _tabela_propostas,
)


def _montar_instrumentos_repasse_xlsx(db: Session, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    convenios = _convenios(db, filtro)
    propostas = _propostas(db, filtro)
    instrumentos = _instrumentos(db, filtro)
    equipamentos_por_convenio = _carregar_equipamentos_por_convenio(db, convenios)
    entregues_por_convenio = _entregues_por_convenio(db, convenios)

    pasta = xlsx_builder.nova_pasta()
    xlsx_builder.escrever_aba_tabela(
        pasta,
        "Leitura",
        ["Campo", "Valor"],
        _linhas_leitura(
            filtro,
            nivel,
            "instrumentos_repasse",
            {"convenios": len(convenios), "propostas": len(propostas), "monitoramento": len(instrumentos)},
        ),
    )
    xlsx_builder.escrever_aba_tabela(
        pasta, "Resumo", *_resumo_instrumentos_programas(convenios, instrumentos), colunas_moeda=["Valor"]
    )
    xlsx_builder.escrever_aba_tabela(
        pasta, "Resumo (Propostas)", *_resumo_propostas(propostas), colunas_moeda=["Valor"]
    )
    colunas_equip, linhas_equip = _resumo_equipamentos(equipamentos_por_convenio, entregues_por_convenio)
    xlsx_builder.escrever_aba_tabela(
        pasta,
        "Resumo (Equipamentos)",
        colunas_equip,
        linhas_equip or [["Nenhum equipamento identificado", 0, None, None]],
        colunas_moeda=["Valor"],
    )
    colunas_conv, linhas_conv = _tabela_convenios(convenios, nivel)
    xlsx_builder.escrever_aba_tabela(
        pasta,
        "Convênios",
        colunas_conv,
        linhas_conv,
        colunas_moeda=_MOEDA_CONVENIO_COMPLETO if nivel == "completo" else _MOEDA_CONVENIO_SIMPLIFICADO,
        colunas_data=_DATA_CONVENIO_COMPLETO if nivel == "completo" else [],
    )
    colunas_prop, linhas_prop = _tabela_propostas(propostas, nivel)
    xlsx_builder.escrever_aba_tabela(
        pasta,
        "Propostas",
        colunas_prop,
        linhas_prop,
        colunas_moeda=_MOEDA_PROPOSTA,
        colunas_data=_DATA_PROPOSTA,
    )
    if nivel == "simplificado":
        colunas_mon, linhas_mon = _tabela_monitoramento_simplificado(instrumentos)
        xlsx_builder.escrever_aba_tabela(pasta, "Monitoramento", colunas_mon, linhas_mon)
    else:
        colunas_mon, linhas_mon = _tabela_monitoramento_timeline(db, instrumentos)
        xlsx_builder.escrever_aba_tabela(
            pasta, "Monitoramento (timeline)", colunas_mon, linhas_mon, colunas_data=_DATA_MONITORAMENTO_TIMELINE
        )
    return xlsx_builder.gerar_bytes(pasta)
