"""Montagem do Word do relatório de instrumentos e repasse.

Parte do pacote de relatórios; a fachada pública é `app.services.relatorios`.
"""

from __future__ import annotations

import itertools
from collections import defaultdict
from collections.abc import Iterator, Sequence
from datetime import date, datetime, timezone

from docx.document import Document as DocumentType
from sqlalchemy.orm import Session

from app.db.models import (
    AcaoMonitoramento,
    Convenio,
    EventoMarco,
    MarcoCatalogo,
    PropostaCandidata,
)
from app.pipeline.texto import capitalizar_nome
from app.reports import docx_builder
from app.reports.formatacao import formatar_data, formatar_moeda
from app.repositories import monitoramento as monitoramento_repo
from app.services.monitoramento_instrumentos import InstrumentoComFase
from app.services.relatorios_conclusao import (
    COLUNAS_PROXIMAS,
    COLUNAS_SINTESE,
    agenda_dos_instrumentos,
    proximas_previsoes,
    sintese,
)
from app.services.relatorios_filtro import (
    _SITUACAO_SEM_MONITORAMENTO_ESPERADO,
    FiltroRelatorio,
    Nivel,
    _assunto,
    _legendas_resumo,
    _valor_global_confiavel,
)
from app.services.relatorios_monitoramento import DadosMonitoramentoRelatorio, carregar_monitoramento_relatorio
from app.services.relatorios_recorte import _convenios, _instrumentos, _propostas
from app.services.relatorios_tabelas import (
    _GRUPOS_ORIGEM_CONVENIO,
    _MARCO_INAUGURACAO_CODIGO,
    _ROTULO_OUTROS_ORIGEM,
    _SEM_EVENTO_REGISTRADO,
    _carregar_equipamentos_por_convenio,
    _entregues_por_convenio,
    _linhas_timeline_instrumento,
    _resumo_equipamentos,
    _resumo_instrumentos_programas,
    _resumo_propostas,
)


def _formatar_ultima_acao(acao: AcaoMonitoramento) -> str:
    if acao.data_conclusao:
        return f"{acao.descricao} (concluída em {formatar_data(acao.data_conclusao)})"
    if acao.data_prevista:
        return f"{acao.descricao} (prevista para {formatar_data(acao.data_prevista)})"
    return acao.descricao


def _formatar_ultimo_evento(evento: EventoMarco, marcos: dict[int, MarcoCatalogo]) -> str:
    marco = marcos.get(evento.marco_id)
    rotulo = marco.rotulo if marco else "Marco"
    data = evento.data_ocorrencia or evento.data_prevista
    return f"{rotulo} ({formatar_data(data)})" if data else rotulo


def _data_inauguracao_previsao(fase_atual: str, eventos_inauguracao: Sequence[EventoMarco]) -> str:
    """Regra exata do usuário (Bloco 8): PERSUS/instrumento CONCLUÍDO usa a
    data de inauguração REAL (`data_ocorrencia`); em andamento mostra a
    PREVISÃO (`data_prevista`) -- mesmo evento (marco
    `cronograma_previsao_inauguracao`) carrega os 2 campos."""
    if not eventos_inauguracao:
        return "—"
    evento = eventos_inauguracao[0]
    if fase_atual == "Concluído" and evento.data_ocorrencia:
        return formatar_data(evento.data_ocorrencia)
    if evento.data_prevista:
        return f"{formatar_data(evento.data_prevista)} (previsão)"
    if evento.data_ocorrencia:
        return formatar_data(evento.data_ocorrencia)
    return "—"


_TIPO_PERSUS_I = "PERSUS I"

_COLUNAS_ACOES_BLOCO = ["Descrição", "Responsável", "Prevista", "Conclusão"]

_DATA_ACOES_BLOCO = ["Prevista", "Conclusão"]

# Timeline por instrumento (Fase 2) reaproveita `_linhas_timeline_instrumento`
# (mesma função já usada pela aba "Monitoramento (timeline)" do xlsx) --
# descarta as 3 primeiras colunas (Convênio/Convenente/Componente), já
# implícitas no bloco narrativo em volta, e a última ("Observação" --
# pedido do usuário depois de ver a amostra: "pode tirar o observação").
# Marco e grupo ficam na mesma célula, em linhas distintas, preservando os
# dois campos e reservando largura para as datas no Word. O XLSX não muda.
_COLUNAS_TIMELINE_BLOCO = ["Marco e grupo", "Ocorrência", "Previsão", "Status", "Nº documento", "Validade"]

_DATA_TIMELINE_BLOCO = ["Ocorrência", "Previsão", "Validade"]


def _tabela_acoes_bloco(documento: DocumentType, dados: DadosMonitoramentoRelatorio, instrumento_id: int) -> None:
    """Lista completa de `AcaoMonitoramento` do instrumento (Fase 2, nível
    Completo) -- "mais etapas, não só a última" (pedido do usuário ao
    comparar com o exemplo do mockup)."""
    docx_builder.adicionar_titulo(documento, "Ações", nivel=4)
    acoes = dados.acoes_por_instrumento.get(instrumento_id, [])
    if not acoes:
        docx_builder.adicionar_paragrafo(documento, "— nenhuma ação registrada —")
        return
    nomes = dados.nomes_responsaveis
    linhas: list[list[object]] = [
        [
            acao.descricao,
            (nomes.get(acao.responsavel_id) if acao.responsavel_id else None) or acao.responsavel or "—",
            acao.data_prevista,
            acao.data_conclusao,
        ]
        for acao in acoes
    ]
    docx_builder.adicionar_tabela(
        documento,
        _COLUNAS_ACOES_BLOCO,
        docx_builder.linhas_como_texto(_COLUNAS_ACOES_BLOCO, linhas, colunas_data=_DATA_ACOES_BLOCO),
        pesos_colunas=[5, 1.8, 1.55, 1.55],
        fonte_pt=11,
    )


def _secao_monitoramento_interno(
    documento: DocumentType,
    dados: DadosMonitoramentoRelatorio,
    inst: InstrumentoComFase | None,
    marco_inauguracao_id: int | None,
    situacao_convenio: str | None = None,
    *,
    nivel: Nivel = "simplificado",
) -> None:
    """Seção nova (Bloco 8, mockup do usuário) -- nível Simplificado mostra
    o estado ATUAL do monitoramento interno (4 rótulos, mesmo sem
    instrumento monitorado, reproduzindo exatamente o mockup); nível
    Completo (Fase 2) troca isso pela timeline inteira de eventos mais a
    lista completa de ações, em vez de só o mais recente de cada.

    Achado ao vivo 2026-09-27 (usuário, PERSUS II): "—" sem contexto parece
    lacuna, mas os 50 convênios PERSUS II têm `situacao="Em contratação"`
    sem exceção -- ainda não existe obra/equipamento/licença pra registrar
    nessa fase (só assinatura). Explicita isso em vez de deixar como se
    fosse dado faltando."""
    docx_builder.adicionar_titulo(documento, "Monitoramento Interno", nivel=4)
    if inst is None and situacao_convenio == _SITUACAO_SEM_MONITORAMENTO_ESPERADO:
        docx_builder.adicionar_paragrafo(
            documento,
            "Instrumento ainda em fase de contratação -- sem obra, equipamento ou licença pra registrar "
            "no monitoramento interno até a assinatura/repasse ser concluído.",
        )
        return
    if nivel == "completo":
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Situação", inst.fase_atual if inst else "—")
        if inst is None:
            docx_builder.adicionar_paragrafo(documento, "— nenhum evento ou ação registrado —")
            return
        eventos_completo = dados.eventos_por_instrumento.get(inst.instrumento.id, [])
        docx_builder.adicionar_paragrafo_rotulo_valor(
            documento,
            "Data de Inauguração/Previsão",
            _data_inauguracao_previsao(
                inst.fase_atual,
                [e for e in eventos_completo if marco_inauguracao_id and e.marco_id == marco_inauguracao_id],
            ),
        )
        linhas_timeline = [
            [f"{linha[3] or '—'}\n{linha[4] or '—'}", *linha[5:-1]]
            for linha in _linhas_timeline_instrumento(dados, inst)
        ]
        if len(linhas_timeline) == 1 and str(linhas_timeline[0][0]).split("\n", 1)[0] == _SEM_EVENTO_REGISTRADO:
            docx_builder.adicionar_paragrafo(documento, _SEM_EVENTO_REGISTRADO)
        else:
            docx_builder.adicionar_tabela(
                documento,
                _COLUNAS_TIMELINE_BLOCO,
                docx_builder.linhas_como_texto(
                    _COLUNAS_TIMELINE_BLOCO, linhas_timeline, colunas_data=_DATA_TIMELINE_BLOCO
                ),
                pesos_colunas=[4, 2.3, 2.3, 1.9, 2.44, 2.3],
                fonte_pt=10,
            )
        _tabela_acoes_bloco(documento, dados, inst.instrumento.id)
        return
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Situação", inst.fase_atual if inst else "—")
    if inst is None:
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Última Ação", "—")
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Último Evento", "—")
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Data de Inauguração/Previsão", "—")
        return
    eventos = dados.eventos_por_instrumento.get(inst.instrumento.id, [])
    eventos_inauguracao = [e for e in eventos if marco_inauguracao_id and e.marco_id == marco_inauguracao_id]
    # D05: a data de inauguração/previsão vem logo depois da situação, antes de última ação e último evento.
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Data de Inauguração/Previsão", _data_inauguracao_previsao(inst.fase_atual, eventos_inauguracao)
    )
    acoes = dados.acoes_por_instrumento.get(inst.instrumento.id, [])
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Última Ação", _formatar_ultima_acao(acoes[0]) if acoes else "—"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Último Evento", _formatar_ultimo_evento(eventos[0], dados.marcos) if eventos else "—"
    )


def _tabela_equipamentos_bloco(
    documento: DocumentType, itens: Sequence[tuple[str, float | None]], entregues: dict[str, int] | None = None
) -> None:
    docx_builder.adicionar_titulo(documento, "Equipamentos", nivel=4)
    if not itens:
        docx_builder.adicionar_paragrafo(documento, "— nenhum equipamento identificado —")
        return
    valores_por_nome: dict[str, list[float | None]] = defaultdict(list)
    for nome, valor in itens:
        valores_por_nome[nome].append(valor)
    com_entregues = bool(entregues)
    colunas = ["Equipamentos", "Quantidade", *(["Entregues"] if com_entregues else []), "Valor"]
    linhas: list[list[object]] = []
    for nome, valores in sorted(valores_por_nome.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        preenchidos = [v for v in valores if v is not None]
        linhas.append(
            [
                nome,
                len(valores),
                *([(entregues or {}).get(nome)] if com_entregues else []),
                sum(preenchidos) if preenchidos else None,
            ]
        )
    docx_builder.adicionar_tabela(
        documento, colunas, docx_builder.linhas_como_texto(colunas, linhas, colunas_moeda=["Valor"])
    )


def _tabela_financeiro_bloco(documento: DocumentType, convenio: Convenio) -> None:
    docx_builder.adicionar_titulo(documento, "Financeiro", nivel=4)
    colunas = ["Financeiro", "Valor"]
    linhas: list[list[object]] = [
        ["Valor Global", _valor_global_confiavel(convenio)],
        ["Valor Repasse", convenio.valor_repasse],
        ["Contrapartida", convenio.valor_contrapartida],
    ]
    docx_builder.adicionar_tabela(
        documento, colunas, docx_builder.linhas_como_texto(colunas, linhas, colunas_moeda=["Valor"])
    )


def _bloco_instrumento_narrativo(
    documento: DocumentType,
    dados: DadosMonitoramentoRelatorio,
    convenio: Convenio,
    inst: InstrumentoComFase | None,
    equipamentos_por_convenio: dict[int, list[tuple[str, float | None]]],
    marco_inauguracao_id: int | None,
    nivel: Nivel,
    entregues_por_convenio: dict[int, dict[str, int]] | None = None,
) -> None:
    # Rótulo dinâmico (achado ao vivo 2026-09-27, usuário: "PERSUS, TED e FAF
    # não são tratados como convênio e sim como instrumentos/programas") --
    # antes o cabeçalho/rótulo dizia "Convênio" pra QUALQUER tipo, inclusive
    # PERSUS I/II (que não são convênio nenhum). Usa o `tipo_contratacao`
    # real do registro.
    tipo_rotulo = convenio.tipo_contratacao or "Convênio"
    docx_builder.adicionar_titulo(documento, f"{convenio.convenente_nome or 'Instituição não informada'} -- {tipo_rotulo} {convenio.numero}", nivel=3)
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Convenente", convenio.convenente_nome or "Instituição não informada")
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "CNPJ", convenio.convenente_cnpj or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "CNES", convenio.cnes or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Objeto", convenio.objeto or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Município/UF", f"{capitalizar_nome(convenio.municipio) or '—'}/{convenio.uf or '—'}"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Tipo de contratação", convenio.tipo_contratacao or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento,
        "Situação (Site)",
        f"{convenio.situacao or '—'} ({convenio.situacao_contratacao or 'normal'})",
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento,
        "Vigência",
        f"{formatar_data(convenio.data_inicio_vigencia)} a {formatar_data(convenio.data_final_vigencia)}",
    )
    _secao_monitoramento_interno(documento, dados, inst, marco_inauguracao_id, convenio.situacao, nivel=nivel)
    _tabela_equipamentos_bloco(
        documento,
        equipamentos_por_convenio.get(convenio.id, []),
        (entregues_por_convenio or {}).get(convenio.id),
    )
    _tabela_financeiro_bloco(documento, convenio)


def _bloco_monitorado_sem_bloco_oficial(
    documento: DocumentType,
    dados: DadosMonitoramentoRelatorio,
    item: InstrumentoComFase,
    marco_inauguracao_id: int | None,
    nivel: Nivel,
) -> None:
    """Acompanhamento sem bloco oficial no recorte, sem criar dados financeiros."""
    instrumento = item.instrumento
    docx_builder.adicionar_titulo(documento, instrumento.nome_convenente, nivel=3)
    for rotulo, valor in (
        ("Número", instrumento.nr_convenio),
        ("Convenente", instrumento.nome_convenente),
        ("CNES", instrumento.cnes),
        ("Tipo de contratação", instrumento.tipo_contratacao),
        ("Ano de origem", str(instrumento.ano_instrumento) if instrumento.ano_instrumento is not None else None),
    ):
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, rotulo, valor or "—")
    _secao_monitoramento_interno(documento, dados, item, marco_inauguracao_id, nivel=nivel)


def _bloco_proposta_narrativo(documento: DocumentType, proposta: PropostaCandidata) -> None:
    docx_builder.adicionar_titulo(documento, f"{proposta.nm_proponente} -- Proposta {proposta.id_proposta}", nivel=3)
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Proponente", f"{proposta.nm_proponente} (CNPJ {proposta.cnpj_ente_recebedor or '—'})"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Município/UF", f"{capitalizar_nome(proposta.municipio) or '—'}/{proposta.uf or '—'}"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Programa", proposta.nm_programa or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Situação", proposta.situacao_proposta or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Parceria formalizada", "Sim" if proposta.tem_parceria else "Não"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Valor global", formatar_moeda(proposta.vl_global_proposta)
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Data da proposta", formatar_data(proposta.data_proposta))


def _secao_sintese_conclusao(
    documento: DocumentType,
    instrumentos: Sequence[InstrumentoComFase],
    dados: DadosMonitoramentoRelatorio,
    contador: Iterator[int],
) -> None:
    docx_builder.adicionar_titulo(documento, "Síntese de conclusões e próximas previsões")
    if not instrumentos:
        docx_builder.adicionar_paragrafo(documento, "Nenhum instrumento em monitoramento interno neste recorte.")
        return
    hoje = date.today()
    agenda = agenda_dos_instrumentos(instrumentos, dados, hoje)
    docx_builder.adicionar_tabela(
        documento,
        COLUNAS_SINTESE,
        docx_builder.linhas_como_texto(COLUNAS_SINTESE, sintese(agenda)),
    )
    docx_builder.adicionar_legenda_tabela(
        documento,
        next(contador),
        "Situação de conclusão dos instrumentos em monitoramento interno. Lacunas de cadastro (sem data de conclusão "
        "ou sem previsão) são pendências de registro, não atraso.",
    )
    for titulo, vencidas in (("Próximas previsões de inauguração", False), ("Previsões de inauguração vencidas", True)):
        linhas = proximas_previsoes(agenda, hoje, vencidas=vencidas)
        if not linhas:
            continue
        docx_builder.adicionar_titulo(documento, titulo, nivel=3)
        docx_builder.adicionar_tabela(
            documento,
            COLUNAS_PROXIMAS,
            docx_builder.linhas_como_texto(COLUNAS_PROXIMAS, linhas, colunas_data=["Previsão de inauguração"]),
        )


def _montar_instrumentos_repasse_docx(db: Session, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    convenios = _convenios(db, filtro)
    propostas = _propostas(db, filtro)
    instrumentos = _instrumentos(db, filtro)
    dados = carregar_monitoramento_relatorio(db=db, instrumento_ids=[i.instrumento.id for i in instrumentos])
    equipamentos_por_convenio = _carregar_equipamentos_por_convenio(db, convenios)
    entregues_por_convenio = _entregues_por_convenio(db, convenios)

    documento = docx_builder.novo_documento(f"Instrumentos e repasse -- {filtro.titulo()}")
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Assunto", _assunto(db, filtro))
    periodo = filtro.periodo_referencia()
    if periodo:
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Período de referência", periodo)
    filtros_exclusivos = [
        f"{rotulo}: {valor}"
        for rotulo, valor in (
            (filtro.rotulo_situacao().lower(), filtro.situacao),
            ("programa", filtro.programa),
            ("equipamento", filtro.equipamento),
            ("busca", filtro.busca),
        )
        if valor
    ]
    if filtros_exclusivos:
        docx_builder.adicionar_paragrafo_rotulo_valor(
            documento, "Filtros aplicados", "; ".join(filtros_exclusivos)
        )
    if filtro.tipo_contratacao:
        docx_builder.adicionar_paragrafo_rotulo_valor(
            documento, "Tipo de contratação", filtro.tipo_contratacao
        )
    docx_builder.adicionar_paragrafo(
        documento, "No que compete ao Departamento de Atenção ao Câncer – DECAN, informa-se:"
    )
    contador: Iterator[int] = itertools.count(1)

    # D05: a leitura executiva abre pela conclusão e pela agenda de previsões, nos dois níveis.
    _secao_sintese_conclusao(documento, instrumentos, dados, contador)

    docx_builder.adicionar_titulo(documento, "Resumo executivo")
    legenda_instrumentos, legenda_propostas, legenda_equipamentos = _legendas_resumo(filtro)
    for colunas_resumo, linhas_resumo, legenda, vazio in (
        (*_resumo_instrumentos_programas(convenios, instrumentos), legenda_instrumentos, None),
        (*_resumo_propostas(propostas), legenda_propostas, None),
        (
            *_resumo_equipamentos(equipamentos_por_convenio, entregues_por_convenio),
            legenda_equipamentos,
            "Nenhum equipamento identificado neste recorte.",
        ),
    ):
        if not linhas_resumo:
            # Propostas e instrumentos vazios simplesmente não geram tabela: o aviso de equipamento não se aplica.
            if vazio:
                docx_builder.adicionar_paragrafo(documento, vazio)
            continue
        docx_builder.adicionar_tabela(
            documento,
            colunas_resumo,
            docx_builder.linhas_como_texto(colunas_resumo, linhas_resumo, colunas_moeda=["Valor"]),
        )
        docx_builder.adicionar_legenda_tabela(documento, next(contador), legenda)
    docx_builder.adicionar_fonte(
        documento,
        "Convênios (SICONV/TransfereGov), propostas (TransfereGov) e monitoramento interno, SISGEO.",
    )
    docx_builder.adicionar_titulo(documento, "Informações Detalhadas")
    instrumentos_por_nr = {i.instrumento.nr_convenio: i for i in instrumentos}
    marco_inauguracao = monitoramento_repo.obter_marco_por_codigo(db, _MARCO_INAUGURACAO_CODIGO)
    marco_inauguracao_id = marco_inauguracao.id if marco_inauguracao else None

    tipos_ja_agrupados: set[str] = set()
    for rotulo_grupo, tipos in _GRUPOS_ORIGEM_CONVENIO:
        tipos_ja_agrupados |= tipos
        itens_grupo = [c for c in convenios if (c.tipo_contratacao or "Convênio") in tipos]
        if not itens_grupo:
            continue
        docx_builder.adicionar_titulo(documento, rotulo_grupo, nivel=2)
        for convenio in itens_grupo:
            _bloco_instrumento_narrativo(
                documento,
                dados,
                convenio,
                instrumentos_por_nr.get(convenio.numero),
                equipamentos_por_convenio,
                marco_inauguracao_id,
                nivel,
                entregues_por_convenio,
            )
    itens_outros = [c for c in convenios if (c.tipo_contratacao or "Convênio") not in tipos_ja_agrupados]
    if itens_outros:
        docx_builder.adicionar_titulo(documento, _ROTULO_OUTROS_ORIGEM, nivel=2)
        for convenio in itens_outros:
            _bloco_instrumento_narrativo(
                documento,
                dados,
                convenio,
                instrumentos_por_nr.get(convenio.numero),
                equipamentos_por_convenio,
                marco_inauguracao_id,
                nivel,
                entregues_por_convenio,
            )

    numeros_com_bloco = {convenio.numero for convenio in convenios}
    monitorados_sem_bloco = [item for item in instrumentos if item.instrumento.nr_convenio not in numeros_com_bloco]
    if monitorados_sem_bloco:
        docx_builder.adicionar_titulo(documento, "Acompanhamento interno no recorte", nivel=2)
        for item in monitorados_sem_bloco:
            _bloco_monitorado_sem_bloco_oficial(documento, dados, item, marco_inauguracao_id, nivel)

    if propostas:
        docx_builder.adicionar_titulo(documento, "Propostas e Parcerias (Novo TransfereGOV):", nivel=2)
        for proposta in propostas:
            _bloco_proposta_narrativo(documento, proposta)

    docx_builder.adicionar_logotipo_final(documento)
    return docx_builder.gerar_bytes(documento)
