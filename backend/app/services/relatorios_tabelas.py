"""Tabelas e resumos do relatório de instrumentos e repasse.

Parte do pacote de relatórios; a fachada pública é `app.services.relatorios`.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classificacao_itens import classificar
from app.db.models import (
    Convenio,
    InstrumentoEquipamento,
    PropostaCandidata,
)
from app.pipeline.itens_plano import descricoes_so_de_obra_ou_servico, item_conta_como_equipamento
from app.pipeline.texto import capitalizar_nome, parsear_valor_brasileiro
from app.repositories import equipamento_marcadores as equipamento_marcadores_repo
from app.repositories import itens_equipamento as itens_equipamento_repo
from app.services.monitoramento_instrumentos import InstrumentoComFase
from app.services.relatorios_filtro import (
    _ROTULO_CONTRATACAO,
    _ROTULO_GRUPO_MARCO,
    _SITUACAO_SEM_MONITORAMENTO_ESPERADO,
    _TIPO_EM_CONTRATACAO,
    Nivel,
    _valor_global_confiavel,
)
from app.services.relatorios_monitoramento import DadosMonitoramentoRelatorio, carregar_monitoramento_relatorio

_COLUNAS_CONVENIO_SIMPLIFICADO = [
    "Número",
    "Convenente",
    "Município",
    "UF",
    "Tipo de contratação",
    "Situação",
    "Ano",
    "Valor global",
]

_COLUNAS_CONVENIO_COMPLETO = [
    "Número",
    "Convenente",
    "CNPJ",
    "Município",
    "UF",
    "Tipo de contratação",
    "Tipologia",
    "Programa",
    "Órgão",
    "Situação",
    "Situação da contratação",
    "Ano",
    "Publicação",
    "Início vigência",
    "Fim vigência",
    "Conclusão",
    "Valor global",
    "Valor repasse",
    "Valor empenhado",
    "Valor desembolsado",
    "Valor contrapartida",
    "Saldo em conta",
    "Valor pago ao fornecedor",
    "CNES",
]

_MOEDA_CONVENIO_SIMPLIFICADO = ["Valor global"]

_MOEDA_CONVENIO_COMPLETO = [
    "Valor global",
    "Valor repasse",
    "Valor empenhado",
    "Valor desembolsado",
    "Valor contrapartida",
    "Saldo em conta",
    "Valor pago ao fornecedor",
]

_DATA_CONVENIO_COMPLETO = ["Publicação", "Início vigência", "Fim vigência", "Conclusão"]


def _linhas_convenio(convenio: Convenio, *, completo: bool) -> list[object]:
    if not completo:
        return [
            convenio.numero,
            convenio.convenente_nome,
            capitalizar_nome(convenio.municipio),
            convenio.uf,
            convenio.tipo_contratacao,
            convenio.situacao,
            convenio.ano_instrumento,
            _valor_global_confiavel(convenio),
        ]
    return [
        convenio.numero,
        convenio.convenente_nome,
        convenio.convenente_cnpj,
        capitalizar_nome(convenio.municipio),
        convenio.uf,
        convenio.tipo_contratacao,
        convenio.tipologia,
        convenio.programa,
        convenio.orgao,
        convenio.situacao,
        convenio.situacao_contratacao,
        convenio.ano_instrumento,
        convenio.data_publicacao,
        convenio.data_inicio_vigencia,
        convenio.data_final_vigencia,
        convenio.data_conclusao,
        _valor_global_confiavel(convenio),
        convenio.valor_repasse,
        convenio.valor_empenhado,
        convenio.valor_desembolsado,
        convenio.valor_contrapartida,
        convenio.valor_saldo_conta,
        convenio.valor_pago_fornecedor,
        convenio.cnes,
    ]


def _tabela_convenios(convenios: Sequence[Convenio], nivel: Nivel) -> tuple[list[str], list[list[object]]]:
    completo = nivel == "completo"
    colunas = _COLUNAS_CONVENIO_COMPLETO if completo else _COLUNAS_CONVENIO_SIMPLIFICADO
    linhas = [_linhas_convenio(c, completo=completo) for c in convenios]
    return colunas, linhas


_COLUNAS_PROPOSTA_SIMPLIFICADO = ["Proposta", "Parceria", "Proponente", "Programa", "Situação", "Valor global"]

_COLUNAS_PROPOSTA_COMPLETO = [
    "Proposta",
    "Parceria",
    "Proponente",
    "CNPJ",
    "Município",
    "UF",
    "Programa",
    "Componente",
    "Equipamento detectado",
    "Situação",
    "Tem parceria formalizada",
    "Valor global",
    "Data da proposta",
    "CNES",
]

_MOEDA_PROPOSTA = ["Valor global"]

_DATA_PROPOSTA = ["Data da proposta"]


def _linhas_proposta(proposta: PropostaCandidata, *, completo: bool) -> list[object]:
    if not completo:
        return [
            proposta.id_proposta,
            proposta.cd_parceria,
            proposta.nm_proponente,
            proposta.nm_programa,
            proposta.situacao_proposta,
            proposta.vl_global_proposta,
        ]
    return [
        proposta.id_proposta,
        proposta.cd_parceria,
        proposta.nm_proponente,
        proposta.cnpj_ente_recebedor,
        capitalizar_nome(proposta.municipio),
        proposta.uf,
        proposta.nm_programa,
        proposta.componente_batido,
        proposta.equipamento_detectado,
        proposta.situacao_proposta,
        "Sim" if proposta.tem_parceria else "Não",
        proposta.vl_global_proposta,
        proposta.data_proposta,
        proposta.cnes,
    ]


def _tabela_propostas(propostas: Sequence[PropostaCandidata], nivel: Nivel) -> tuple[list[str], list[list[object]]]:
    completo = nivel == "completo"
    colunas = _COLUNAS_PROPOSTA_COMPLETO if completo else _COLUNAS_PROPOSTA_SIMPLIFICADO
    linhas = [_linhas_proposta(p, completo=completo) for p in propostas]
    return colunas, linhas


_COLUNAS_MONITORAMENTO_SIMPLIFICADO = ["Convênio", "Convenente", "Município", "UF", "Tipo de contratação", "Fase atual"]

_COLUNAS_MONITORAMENTO_TIMELINE = [
    "Convênio",
    "Convenente",
    "Componente",
    "Marco",
    "Grupo",
    "Data ocorrência",
    "Data prevista",
    "Status regulatório",
    "Nº documento",
    "Validade",
    "Observação",
]

_DATA_MONITORAMENTO_TIMELINE = ["Data ocorrência", "Data prevista", "Validade"]


def _tabela_monitoramento_simplificado(
    instrumentos: Sequence[InstrumentoComFase],
) -> tuple[list[str], list[list[object]]]:
    linhas: list[list[object]] = [
        [
            i.instrumento.nr_convenio,
            i.instrumento.nome_convenente,
            capitalizar_nome(i.instrumento.municipio),
            i.instrumento.uf,
            i.instrumento.tipo_contratacao,
            i.fase_atual,
        ]
        for i in instrumentos
    ]
    return _COLUNAS_MONITORAMENTO_SIMPLIFICADO, linhas


_PADRAO_PROVENIENCIA_IMPORTACAO = re.compile(
    r"\s*Importado de .*?sha256:[0-9a-f]+(?:, linha \d+)?\.\s*$", re.IGNORECASE
)


def _observacao_publica(observacao: str | None) -> str | None:
    """Remove o rodapé de proveniência de importação em lote ("Importado de
    Controle PERSUS.xlsx · sha256:..., linha N.") do texto exibido no
    relatório -- achado ao vivo (Bloco 8, "dados feios"): 532 dos 984
    eventos carregados por `scripts/importar_programas_monitoramento.py`
    têm essa marca dentro do próprio campo `observacao`, útil como
    auditoria interna (mesmo espírito de `chave_origem`, nunca exposto na
    API/UI) mas sem sentido pra quem lê um relatório institucional. Só
    afeta a APRESENTAÇÃO -- o campo no banco continua intacto."""
    if not observacao:
        return observacao
    texto = _PADRAO_PROVENIENCIA_IMPORTACAO.sub("", observacao).strip()
    return texto or None


_SEM_EVENTO_REGISTRADO = "— nenhum evento registrado —"


def _linhas_timeline_instrumento(dados: DadosMonitoramentoRelatorio, item: InstrumentoComFase) -> list[list[object]]:
    inst = item.instrumento
    eventos = dados.eventos_por_instrumento.get(inst.id, [])
    if not eventos:
        linha_sem_evento: list[object] = [
            inst.nr_convenio,
            inst.nome_convenente,
            inst.componente,
            _SEM_EVENTO_REGISTRADO,
        ]
        linha_sem_evento.extend([None] * 7)
        return [linha_sem_evento]
    linhas: list[list[object]] = []
    for evento in sorted(eventos, key=lambda e: e.data_ocorrencia or e.data_prevista or date.min):
        marco = dados.marcos.get(evento.marco_id)
        linhas.append(
            [
                inst.nr_convenio,
                inst.nome_convenente,
                inst.componente,
                marco.rotulo if marco else None,
                _ROTULO_GRUPO_MARCO.get(marco.grupo) if marco else None,
                evento.data_ocorrencia,
                evento.data_prevista,
                evento.status_regulatorio,
                evento.numero_documento,
                evento.data_validade,
                _observacao_publica(evento.observacao),
            ]
        )
    return linhas


def _tabela_monitoramento_timeline(
    db: Session, instrumentos: Sequence[InstrumentoComFase]
) -> tuple[list[str], list[list[object]]]:
    dados = carregar_monitoramento_relatorio(
        db=db, instrumento_ids=[i.instrumento.id for i in instrumentos], com_acoes=False
    )
    linhas: list[list[object]] = []
    for item in instrumentos:
        linhas.extend(_linhas_timeline_instrumento(dados, item))
    return _COLUNAS_MONITORAMENTO_TIMELINE, linhas


_ORDEM_TIPO_CONTRATACAO = ["Convênio", "FAF", "TED", "PERSUS I", "PERSUS II", "PRONON"]

_ROTULO_TIPO_CONTRATACAO = {"Convênio": "Convênios"}

_MARCO_INAUGURACAO_CODIGO = "cronograma_previsao_inauguracao"

# 3 grupos de origem pro "Informações Detalhadas" (Bloco 8, mockup do
# usuário -- `data/relatorios/relatorio_imip.pages`): Convênio/FAF/TED
# formam 1 grupo (mesmo vocabulário fechado, tratamento igual), PERSUS I/II
# outro. "Outros" (PRONON/tipo não mapeado) cobre o que sobrar -- nunca
# esconder convênio silenciosamente por não bater num dos 2 grupos
# conhecidos do mockup.
_GRUPOS_ORIGEM_CONVENIO: list[tuple[str, set[str]]] = [
    ("Convênios, TED e FAF:", {"Convênio", "FAF", "TED"}),
    ("PERSUS I e II:", {"PERSUS I", "PERSUS II"}),
]

_ROTULO_OUTROS_ORIGEM = "Outros instrumentos:"


def _valores_por_item_plano(convenio: Convenio) -> dict[str, float]:
    """`siconv_raw.itens_plano_aplicacao` (achado ao vivo 2026-09-27,
    lembrete do usuário: "no itens DL e no pagamentos ao fornecedor tem
    info do equipamento individual") tem `VALOR_TOTAL_ITEM` por item --
    `EquipamentoMarcador.descricao_original` é literalmente
    `item['DESCRICAO_ITEM']` sem alteração (mesma origem, ver
    `scripts/preencher_marcadores_itens_plano.sql`), então dá pra casar
    marcador -> valor por igualdade exata de string. Quando 2 itens têm a
    mesma descrição (não deveria acontecer -- cada instância já vem com
    sufixo numérico, ex. "Ultrassom Diagnóstico 1"/"...2") soma os 2."""
    itens = (convenio.siconv_raw or {}).get("itens_plano_aplicacao") or []
    valores: dict[str, float] = defaultdict(float)
    for item in itens:
        if not item_conta_como_equipamento(item):
            continue
        descricao = item.get("DESCRICAO_ITEM")
        valor = parsear_valor_brasileiro(item.get("VALOR_TOTAL_ITEM"))
        if descricao and valor is not None:
            valores[descricao] += valor
    return dict(valores)


def _carregar_equipamentos_por_convenio(
    db: Session, convenios: Sequence[Convenio]
) -> dict[int, list[tuple[str, float | None]]]:
    """`(nome do equipamento, valor individual ou None quando não achado no
    plano de aplicação)` por convênio."""
    marcadores = equipamento_marcadores_repo.listar_por_origens(db, convenio_ids={c.id for c in convenios})
    convenios_por_id = {c.id: c for c in convenios}
    resultado: dict[int, list[tuple[str, float | None]]] = {}
    for (origem, convenio_id), itens in marcadores.items():
        if origem != "convenio":
            continue
        convenio = convenios_por_id.get(convenio_id)
        valores_item = _valores_por_item_plano(convenio) if convenio else {}
        so_obra = (
            descricoes_so_de_obra_ou_servico((convenio.siconv_raw or {}).get("itens_plano_aplicacao") or [])
            if convenio
            else frozenset()
        )
        # Rendimento da aplicação, acessório e item com vários equipamentos não são aquisição de um equipamento:
        # não entram na quantidade nem no valor do equipamento (classificação C5).
        resultado[convenio_id] = [
            (m.nome, valores_item.get(m.descricao_original))
            for m in itens
            if m.descricao_original not in so_obra and classificar(m.descricao_original).tipo == "aquisicao"
        ]
    return resultado


def _entregues_por_convenio(db: Session, convenios: Sequence[Convenio]) -> dict[int, dict[str, int]]:
    """Unidades entregues por família em cada convênio, só onde o instrumento tem controle por unidade."""
    if not convenios:
        return {}
    numeros = {c.numero for c in convenios}
    instrumentos = {
        i.nr_convenio: i.id
        for i in db.execute(
            select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio.in_(numeros))
        ).scalars()
    }
    por_instrumento: dict[int, dict[str, int]] = defaultdict(dict)
    for instrumento_id, familia, _planejado, entregue in itens_equipamento_repo.resumo_por_instrumento_e_familia(
        db, set(instrumentos.values())
    ):
        por_instrumento[instrumento_id][familia] = entregue
    return {
        c.id: por_instrumento[instrumentos[c.numero]]
        for c in convenios
        if c.numero in instrumentos and instrumentos[c.numero] in por_instrumento
    }


def _resumo_instrumentos_programas(
    convenios: Sequence[Convenio], instrumentos: Sequence[InstrumentoComFase]
) -> tuple[list[str], list[list[object]]]:
    """1ª tabela do "Resumo executivo" (Bloco 8, mockup do usuário) --
    contagem + valor global conhecido por `tipo_contratacao`, mais a contagem (sem
    valor financeiro -- é acompanhamento) de instrumentos monitorados
    internamente."""
    colunas = ["Instrumentos/Programas", "Quantidade", "Valor"]
    contagem: Counter[str] = Counter()
    com_valor: Counter[str] = Counter()
    valor_por_tipo: dict[str, float] = defaultdict(float)
    for c in convenios:
        tipo = c.tipo_contratacao or "Convênio"
        contagem[tipo] += 1
        valor = _valor_global_confiavel(c)
        if valor is not None:
            com_valor[tipo] += 1
            valor_por_tipo[tipo] += float(valor)
    linhas: list[list[object]] = []
    tipos_em_ordem = [t for t in _ORDEM_TIPO_CONTRATACAO if t in contagem]
    tipos_em_ordem += sorted(t for t in contagem if t not in _ORDEM_TIPO_CONTRATACAO)
    for tipo in tipos_em_ordem:
        valor_linha: object = valor_por_tipo[tipo] if com_valor[tipo] else None
        itens_tipo = [c for c in convenios if (c.tipo_contratacao or "Convênio") == tipo]
        if (
            valor_linha is None
            and tipo == _TIPO_EM_CONTRATACAO
            and all(c.situacao == _SITUACAO_SEM_MONITORAMENTO_ESPERADO for c in itens_tipo)
        ):
            # Ainda sem repasse nem valor: a própria tabela diz o motivo.
            valor_linha = _ROTULO_CONTRATACAO
        linhas.append([_ROTULO_TIPO_CONTRATACAO.get(tipo, tipo), contagem[tipo], valor_linha])
    linhas.append(["Instrumentos monitorados (carteira de acompanhamento)", len(instrumentos), None])
    return colunas, linhas


_SITUACOES_PROPOSTA = [
    ("Aprovada", "Propostas Aprovadas"),
    ("Rejeitada", "Propostas Rejeitadas"),
    ("Em Análise", "Propostas em Análise"),
    ("Em Elaboração", "Propostas em Elaboração"),
]


def _resumo_propostas(propostas: Sequence[PropostaCandidata]) -> tuple[list[str], list[list[object]]]:
    """2ª tabela -- por `situacao_proposta` (as 4 únicas confirmadas contra
    o banco real -- Bloco 8) + "Parcerias Firmadas" (`tem_parceria`)."""
    colunas = ["Propostas", "Quantidade", "Valor"]
    linhas: list[list[object]] = []
    for chave, rotulo in _SITUACOES_PROPOSTA:
        itens = [p for p in propostas if p.situacao_proposta == chave]
        linhas.append([rotulo, len(itens), sum(float(p.vl_global_proposta or 0) for p in itens)])
    parcerias = [p for p in propostas if p.tem_parceria]
    linhas.append(
        [
            "Parcerias firmadas (subconjunto das situações acima)",
            len(parcerias),
            sum(float(p.vl_global_proposta or 0) for p in parcerias),
        ]
    )
    return colunas, linhas


def _resumo_equipamentos(
    equipamentos_por_convenio: dict[int, list[tuple[str, float | None]]],
    entregues_por_convenio: dict[int, dict[str, int]] | None = None,
) -> tuple[list[str], list[list[object]]]:
    """3ª tabela -- agregado de `EquipamentoMarcador` por tipo entre todos
    os convênios do recorte. "Valor" soma o `VALOR_TOTAL_ITEM` do plano de
    aplicação (achado ao vivo 2026-09-27, lembrete do usuário). A soma
    contempla somente ocorrências com valor conhecido; as demais não são
    tratadas como zero."""
    colunas = ["Equipamentos", "Quantidade", "Valor"]
    contagem: Counter[str] = Counter()
    com_valor: Counter[str] = Counter()
    valor_por_nome: dict[str, float] = defaultdict(float)
    for itens in equipamentos_por_convenio.values():
        for nome, valor in itens:
            contagem[nome] += 1
            if valor is not None:
                valor_por_nome[nome] += valor
                com_valor[nome] += 1
    # "Valor" soma só os itens com valor; a nota do relatório explica os sem valor (PERSUS II).
    linhas: list[list[object]] = [
        [nome, quantidade, valor_por_nome[nome] if com_valor[nome] else None]
        for nome, quantidade in sorted(contagem.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    entregues: Counter[str] = Counter()
    for por_familia in (entregues_por_convenio or {}).values():
        entregues.update(por_familia)
    if not entregues_por_convenio or not any(entregues_por_convenio.values()):
        return colunas, linhas
    # "Entregues" são unidades registradas na entrega; "—" nas famílias sem controle por unidade.
    controladas = {nome for por_familia in entregues_por_convenio.values() for nome in por_familia}
    com_entregues = [[n, q, entregues[n] if n in controladas else None, v] for n, q, v in linhas]
    return ["Equipamentos", "Quantidade", "Entregues", "Valor"], com_entregues
