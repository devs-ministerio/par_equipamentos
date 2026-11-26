"""Relatório da carteira de propostas em tramitação."""

from dataclasses import replace
from datetime import date

from sqlalchemy.orm import Session

from app.db.models import PropostaCandidata
from app.equipamentos import CATALOGO_EQUIPAMENTOS, normalizar_texto
from app.geo_reference import REGIAO_POR_UF
from app.pipeline.texto import capitalizar_nome
from app.pipeline.tipo_proposta import tipo_da_proposta
from app.services.relatorios_filtro import FiltroRelatorio
from app.services.relatorios_modelo import (
    Celula,
    RelatorioMonitorado,
    Tabela,
    cabecalho,
    descartar_colunas_vazias,
    descartar_geografia_unica,
    descrever_contratacoes,
    formatar_cnpj,
    quebra_por,
)
from app.services.relatorios_recorte import _propostas

_COLUNAS = (
    "Proponente", "CNES", "Município", "UF", "Região", "Programa", "Equipamento",
    "Situação da Proposta", "Valor Global da Proposta", "Data da Proposta",
)
_COLUNAS_COMPLETO = (
    "Nº da Proposta", "Proponente", "CNPJ do Proponente", "CNES", "Município", "UF", "Região",
    "Programa", "Componente", "Equipamento", "Objeto", "Situação da Proposta",
    "Valor Global da Proposta", "Data da Proposta", "Dias desde a Proposta", "Status da Revisão",
)
_DATAS = ("Data da Proposta",)
_MOEDA = ("Valor Global da Proposta",)


_NOMES_CANONICOS = {normalizar_texto(e.nome): e.nome for e in CATALOGO_EQUIPAMENTOS}


def _equipamento(p: PropostaCandidata) -> str | None:
    """Grafia do catálogo (a detecção grava, por exemplo, "Mamografo" sem acento)."""
    nome = p.equipamento_detectado
    return _NOMES_CANONICOS.get(normalizar_texto(nome), nome) if nome else nome


def _linha(p: PropostaCandidata, *, completo: bool, referencia: date) -> tuple[Celula, ...]:
    uf = (p.uf or "").upper() or None
    local = (p.cnes, capitalizar_nome(p.municipio), uf, REGIAO_POR_UF.get(uf) if uf else None)
    valor = float(p.vl_global_proposta) if p.vl_global_proposta is not None else None
    situacao = (p.situacao_proposta, valor, p.data_proposta)
    if not completo:
        return (p.nm_proponente, *local, p.nm_programa, _equipamento(p), *situacao)
    dias = (referencia - p.data_proposta).days if p.data_proposta else None
    return (
        str(p.id_proposta), p.nm_proponente, formatar_cnpj(p.cnpj_ente_recebedor), *local, p.nm_programa, p.componente_batido,
        _equipamento(p), p.ds_objeto, *situacao, dias, p.status.value if p.status else None,
    )


def montar_propostas(*, db: Session, filtro: FiltroRelatorio, completo: bool, referencia: date) -> RelatorioMonitorado:
    propostas = _propostas(db, replace(filtro, etapa="propostas"))
    valores: dict[str, float] = {}
    for proposta in propostas:
        if proposta.vl_global_proposta is not None:
            situacao = proposta.situacao_proposta or "Sem informação"
            valores[situacao] = valores.get(situacao, 0.0) + float(proposta.vl_global_proposta)
    valores_linhas: list[tuple[Celula, ...]] = sorted(valores.items())
    valores_linhas.append(("Total", sum(valores.values())))
    por_valor = (
        Tabela("Valor por situação", ("Situação da Proposta", "Valor Global da Proposta"), valores_linhas, colunas_moeda=_MOEDA),
    ) if valores else ()
    quebras = descartar_geografia_unica((
        quebra_por("Por situação", "Situação da Proposta", (p.situacao_proposta or "Sem informação" for p in propostas)),
        *por_valor,
        quebra_por("Por programa", "Programa", (p.nm_programa for p in propostas)),
        quebra_por("Por UF", "UF", ((p.uf or "").upper() or "Sem informação" for p in propostas)),
        quebra_por("Por equipamento", "Equipamento", (_equipamento(p) or "Sem informação" for p in propostas)),
    ))
    filtros = " · ".join(filter(None, (
        filtro.situacao, filtro.programa,
        descrever_contratacoes(filtro, (tipo_da_proposta(p.nm_programa) for p in propostas)),
        filtro.equipamento, filtro.busca, filtro.periodo_referencia(),
    ))) or "Sem filtros"
    colunas, linhas = descartar_colunas_vazias(
        _COLUNAS_COMPLETO if completo else _COLUNAS,
        [_linha(p, completo=completo, referencia=referencia) for p in propostas],
    )
    legenda = (
        (("Dias desde a Proposta", "Dias entre a data da proposta e a referência do relatório."),)
        if "Dias desde a Proposta" in colunas else ()
    )
    return RelatorioMonitorado(
        titulo="Propostas", colunas=colunas, linhas=linhas,
        total=len(propostas), unidade="propostas",
        cabecalho=cabecalho(filtro, referencia=referencia, fonte="SISGEO", filtros=filtros),
        indicadores=(("Quantidade de Propostas", len(propostas)),), quebras=quebras,
        legenda=legenda,
        colunas_data=tuple(c for c in _DATAS if c in colunas), colunas_moeda=tuple(c for c in _MOEDA if c in colunas), arquivo_base="propostas", aba_registros="Propostas",
    )
