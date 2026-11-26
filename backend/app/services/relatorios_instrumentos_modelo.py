"""Relatório da carteira monitorada e suas tabelas financeira e de ações."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.db.models import AcaoMonitoramento, Convenio, InstrumentoEquipamento
from app.repositories import itens_equipamento, relatorios_contexto
from app.schemas_monitoramento import EtapasInstrumentoRead
from app.services.monitoramento_instrumentos import InstrumentoComFase
from app.services.relatorios_contexto import contexto_do
from app.services.relatorios_filtro import FiltroRelatorio, _valor_global_confiavel
from app.services.relatorios_inauguracao import inauguracao_da_linha
from app.services.relatorios_modelo import (
    Celula,
    ContextoInstrumento,
    RelatorioMonitorado,
    Tabela,
    cabecalho,
    descrever_filtros,
    quebra_por,
)
from app.valor_global import TIPOS_SEM_DADOS_OFICIAIS, valor_global_considerado

_COLUNAS = (
    "Instrumento", "CNES", "Estabelecimento de Saúde", "Município", "UF", "Região", "Contratação",
    "Situação (Site)", "Situação (Monitoramento)", "Valor Global", "Valor Repassado", "Data de Inauguração",
    "Data de Conclusão do Monitoramento", "Técnico Responsável",
)
_COLUNAS_COMPLETO = (
    *_COLUNAS[:3], "CNPJ do Convenente", *_COLUNAS[3:9],
    "Equipamentos", "Qtd Planejada", "Qtd Entregue", "Qtd em Operação", "% Entregue",
    "Data de Publicação", "Data do Último Repasse", "Data de Entrega do Equipamento",
    "Data de Inauguração", "Data de Conclusão do Monitoramento", "Status da Inauguração",
    "Nº do Processo", "Ano do Instrumento", "Início da Vigência", "Fim da Vigência",
    "Valor Global", "Valor Repassado", "Técnico Responsável", "Nível de Monitoramento", "Ações abertas",
)
_FINANCEIRO = (
    "Instrumento", "Estabelecimento de Saúde", "Valor Global", "Valor de Repasse Pactuado", "Contrapartida",
    "Empenhado", "Valor Repassado", "Pago a Fornecedor", "Saldo em Conta", "Valor do Equipamento", "Valor da Obra",
    "Prestação de Contas", "Ordem de Pagamento",
)
_ACOES = (
    "Nº do Processo", "Instrumento", "CNES", "Estabelecimento de Saúde", "Município", "UF",
    "Ação", "Responsável", "Data Prevista", "Situação da Ação", "Técnico Responsável",
)
_DATAS = (
    "Data de Inauguração", "Data de Conclusão do Monitoramento", "Data de Publicação", "Data do Último Repasse",
    "Data de Entrega do Equipamento", "Início da Vigência", "Fim da Vigência",
)
_MOEDA = ("Valor Global", "Valor Repassado")
_LEGENDA = (
    ("Situação (Site)", "Situação oficial do instrumento nos dados importados."),
    ("Situação (Monitoramento)", "Fase do acompanhamento interno."),
    ("Data de Conclusão do Monitoramento", "Exibida somente quando não há registro de inauguração."),
    ("Valor Repassado", "Desembolso da fonte confiável ou valor integral da carga manual."),
)


@dataclass(frozen=True)
class _Valores:
    global_: float | None
    repassado: float | None
    pactuado: float | None = None
    contrapartida: float | None = None
    empenhado: float | None = None
    pago: float | None = None
    saldo: float | None = None


def _valores(c: Convenio | None, i: InstrumentoEquipamento) -> _Valores:
    if c is None:
        return _Valores(None, None)
    if i.tipo_contratacao in TIPOS_SEM_DADOS_OFICIAIS:
        valor = valor_global_considerado(c.valor_global, tipo_contratacao=i.tipo_contratacao, fonte_confiavel=False)
        return _Valores(valor, valor)
    if not c.financeiro_fonte_confiavel:
        return _Valores(None, None)
    campos = (
        _valor_global_confiavel(c), c.valor_desembolsado, c.valor_repasse, c.valor_contrapartida,
        c.valor_empenhado, c.valor_pago_fornecedor, c.valor_saldo_conta,
    )
    return _Valores(*(float(v) if v is not None else None for v in campos))


@dataclass(frozen=True)
class _Instrumento:
    contexto: ContextoInstrumento
    instrumento: InstrumentoEquipamento
    convenio: Convenio | None
    etapa: EtapasInstrumentoRead
    valores: _Valores


def _linha(f: _Instrumento, *, completo: bool, equipamentos: list[tuple[str, int, int]],
           acoes: list[AcaoMonitoramento]) -> tuple[Celula, ...]:
    ctx, i, c, etapa, valores = f.contexto, f.instrumento, f.convenio, f.etapa, f.valores
    local = (ctx.municipio, ctx.uf, ctx.regiao)
    situacao = (ctx.contratacao, ctx.situacao_site, ctx.situacao_monitoramento)
    datas = (etapa.inauguracao, None if etapa.inauguracao else etapa.conclusao)
    dinheiro = (valores.global_, valores.repassado)
    base = (ctx.numero, ctx.cnes, ctx.estabelecimento)
    if not completo:
        return (*base, *local, *situacao, *dinheiro, *datas, ctx.tecnico)
    planejado = sum(qtd for _, qtd, _ in equipamentos)
    entregue = sum(qtd for _, _, qtd in equipamentos)
    familias = "; ".join(
        f"{nome} ({max(qtd, qtd_entregue)})" if max(qtd, qtd_entregue) > 1 else nome
        for nome, qtd, qtd_entregue in equipamentos
    )
    _, status = inauguracao_da_linha(etapa, "em_operacao" if etapa.modo_operacao else "planejado")
    return (
        *base, i.cnpj_convenente or (c.convenente_cnpj if c else None), *local, *situacao,
        familias or None, planejado, entregue, entregue if etapa.modo_operacao else 0,
        f"{round(entregue / planejado * 100)}%" if planejado else None,
        etapa.publicacao, c.data_ultima_liberacao if c else None, etapa.entrega, *datas, status,
        ctx.numero_processo, ctx.ano, ctx.inicio_vigencia, ctx.fim_vigencia, *dinheiro, ctx.tecnico,
        i.nivel_monitoramento, len(acoes),
    )


def _financeiro(f: _Instrumento) -> tuple[Celula, ...]:
    ctx, i, v = f.contexto, f.instrumento, f.valores
    return (
        ctx.numero, ctx.estabelecimento, v.global_, v.pactuado, v.contrapartida, v.empenhado, v.repassado,
        v.pago, v.saldo, i.investimento_aquisicao, i.valor_obra, i.situacao_prestacao_contas,
        i.situacao_ordem_pagamento_transferegov,
    )


def _acao(ctx: ContextoInstrumento, a: AcaoMonitoramento, referencia: date) -> tuple[Celula, ...]:
    prazo = "Sem prazo" if a.data_prevista is None else "Vencida" if a.data_prevista < referencia else "No prazo"
    return (ctx.numero_processo, ctx.numero, ctx.cnes, ctx.estabelecimento, ctx.municipio, ctx.uf,
            a.descricao, a.responsavel, a.data_prevista, prazo, ctx.tecnico)


def _quebras(fatos: list[_Instrumento], escopo: str) -> tuple[Tabela, ...]:
    contextos = [f.contexto for f in fatos]
    geografia = ("Região", "regiao") if escopo == "brasil" else ("UF", "uf")
    if escopo in ("municipio", "cnes"):
        geografia = ("Estabelecimento de Saúde", "estabelecimento")
    rotulo, campo = geografia
    valores_global = [f.valores.global_ for f in fatos if f.valores.global_ is not None]
    repassados = [f.valores.repassado for f in fatos if f.valores.repassado is not None]
    return (
        quebra_por("Por situação", "Situação (Monitoramento)", (c.situacao_monitoramento or "Sem informação" for c in contextos)),
        quebra_por("Por contratação", "Contratação", (c.contratacao or "Sem informação" for c in contextos)),
        quebra_por(f"Por {rotulo}", rotulo, (getattr(c, campo) or "Sem informação" for c in contextos)),
        Tabela("Valores", _MOEDA, [(sum(valores_global) if valores_global else None,
                                   sum(repassados) if repassados else None)], colunas_moeda=_MOEDA),
    )


def montar_instrumentos(
    *, db: Session, recorte: list[InstrumentoComFase], etapas: dict[str, EtapasInstrumentoRead],
    filtro: FiltroRelatorio, fases: tuple[str, ...], completo: bool, referencia: date,
) -> RelatorioMonitorado:
    numeros = {c.instrumento.nr_convenio for c in recorte}
    convenios = relatorios_contexto.convenios_por_numero(db, numeros)
    nomes = relatorios_contexto.nomes_cnes(db, {c.instrumento.cnes for c in recorte if c.instrumento.cnes})
    fatos = []
    for candidato in recorte:
        i = candidato.instrumento
        convenio = convenios.get(i.nr_convenio)
        contexto = contexto_do(i, candidato.fase_atual, convenio, nomes.get(i.cnes or ""))
        etapa = etapas.get(i.nr_convenio) or EtapasInstrumentoRead(nr_convenio=i.nr_convenio)
        fatos.append(_Instrumento(contexto, i, convenio, etapa, _valores(convenio, i)))

    ids = [f.instrumento.id for f in fatos]
    acoes = relatorios_contexto.acoes_abertas(db, set(ids)) if completo else {}
    familias: dict[int, list[tuple[str, int, int]]] = defaultdict(list)
    if completo:
        for i_id, nome, planejado, entregue, _ in itens_equipamento.resumo_com_cancelamentos_por_familia(db, set(ids)):
            familias[i_id].append((nome, planejado, entregue))
    linhas = [
        _linha(f, completo=completo, equipamentos=familias.get(f.instrumento.id, []),
               acoes=acoes.get(f.instrumento.id, []))
        for f in fatos
    ]
    abas = (
        Tabela("Financeiro", _FINANCEIRO, [_financeiro(f) for f in fatos], colunas_moeda=_FINANCEIRO[2:11]),
        Tabela("Ações em aberto", _ACOES,
               [_acao(f.contexto, a, referencia) for f in fatos for a in acoes.get(f.instrumento.id, [])],
               colunas_data=("Data Prevista",)),
    ) if completo else ()
    quebras = _quebras(fatos, filtro.escopo)
    return RelatorioMonitorado(
        titulo="Instrumentos", colunas=_COLUNAS_COMPLETO if completo else _COLUNAS, linhas=linhas,
        total=len(linhas), unidade="instrumentos", criterios=fases,
        cabecalho=cabecalho(filtro, referencia=referencia, fonte="SISGEO · SICONV · CNES",
                           filtros=descrever_filtros(filtro, fases=fases)),
        indicadores=(("Instrumentos", len(linhas)),), quebras=quebras, abas=abas,
        legenda=_LEGENDA, colunas_data=_DATAS, colunas_moeda=_MOEDA,
        arquivo_base="instrumentos", aba_registros="Instrumentos",
    )
