"""Síntese de conclusões e agenda de previsões do relatório de instrumentos e repasse (D05).

Abre o relatório executivo: o que foi concluído, quando, e a previsão do que segue em andamento. Cálculo puro sobre
os dados de monitoramento já carregados; nada é inferido (sem data fica "sem data", sem previsão fica "sem previsão").
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.pipeline.texto import capitalizar_nome
from app.services.monitoramento_instrumentos import InstrumentoComFase
from app.services.relatorios_monitoramento import DadosMonitoramentoRelatorio

CONCLUIDO = "Concluído"
NAO_INICIADO = "Não iniciado"

COLUNAS_SINTESE = ["Indicador", "Quantidade"]
COLUNAS_AGENDA = [
    "Instrumento",
    "Instituição",
    "Município",
    "UF",
    "Tipo",
    "Fase atual",
    "Situação de conclusão",
    "Conclusão efetiva",
    "Inauguração realizada",
    "Previsão de inauguração",
    "Dias até a previsão",
]
DATAS_AGENDA = ["Conclusão efetiva", "Inauguração realizada", "Previsão de inauguração"]


@dataclass(frozen=True)
class AgendaInstrumento:
    instrumento: InstrumentoComFase
    situacao: str
    conclusao: date | None
    inauguracao_real: date | None
    previsao: date | None

    def dias_ate_previsao(self, hoje: date) -> int | None:
        return (self.previsao - hoje).days if self.previsao and self.inauguracao_real is None else None


def _evento_mais_recente(eventos, marco_id: int | None):
    return next((e for e in eventos if marco_id is not None and e.marco_id == marco_id), None)


def agenda_dos_instrumentos(
    instrumentos: Sequence[InstrumentoComFase], dados: DadosMonitoramentoRelatorio, hoje: date
) -> list[AgendaInstrumento]:
    marco_conclusao = next((m.id for m in dados.marcos.values() if m.codigo == "fase_concluido"), None)
    marco_inauguracao = next(
        (m.id for m in dados.marcos.values() if m.codigo == "cronograma_previsao_inauguracao"), None
    )
    agenda: list[AgendaInstrumento] = []
    for item in instrumentos:
        eventos = dados.eventos_por_instrumento.get(item.instrumento.id, [])
        conclusao = next(
            (e.data_ocorrencia for e in eventos if e.marco_id == marco_conclusao and e.data_ocorrencia), None
        )
        inauguracao = _evento_mais_recente(eventos, marco_inauguracao)
        real = inauguracao.data_ocorrencia if inauguracao else None
        previsao = inauguracao.data_prevista if inauguracao else None
        if item.fase_atual == CONCLUIDO:
            situacao = "Concluído" if conclusao else "Concluído sem data de conclusão"
            if real is None:
                situacao += " e sem inauguração confirmada"
        elif item.fase_atual == NAO_INICIADO:
            situacao = "Não iniciado"
        elif real is not None:
            situacao = "Em andamento, inaugurado"
        elif previsao is None:
            situacao = "Em andamento, sem previsão"
        else:
            situacao = "Em andamento, previsão vencida" if previsao < hoje else "Em andamento, previsão vigente"
        agenda.append(AgendaInstrumento(item, situacao, conclusao, real, previsao))
    return agenda


# Código estável da situação de conclusão, usado pelo filtro da prévia e do arquivo (D01).
CATEGORIAS_CONCLUSAO = {
    "concluido": "Concluído",
    "concluido_sem_data": "Concluído sem data de conclusão",
    "inaugurado": "Em andamento, inaugurado",
    "previsao_vigente": "Em andamento, previsão vigente",
    "previsao_vencida": "Em andamento, previsão vencida",
    "sem_previsao": "Em andamento, sem previsão",
    "nao_iniciado": "Não iniciado",
}


def categoria_da(item: AgendaInstrumento) -> str:
    for codigo, rotulo in CATEGORIAS_CONCLUSAO.items():
        if item.situacao.startswith(rotulo) and not (
            codigo == "concluido" and item.situacao.startswith(CATEGORIAS_CONCLUSAO["concluido_sem_data"])
        ):
            return codigo
    return "concluido"


def sintese(agenda: Sequence[AgendaInstrumento]) -> list[list[object]]:
    def contar(*prefixos: str) -> int:
        return sum(1 for a in agenda if a.situacao.startswith(prefixos))

    concluidos = [a for a in agenda if a.instrumento.fase_atual == CONCLUIDO]
    return [
        ["Instrumentos em monitoramento", len(agenda)],
        ["Concluídos", len(concluidos)],
        ["Concluídos com data de conclusão", sum(1 for a in concluidos if a.conclusao)],
        ["Concluídos sem data de conclusão (lacuna de cadastro)", sum(1 for a in concluidos if not a.conclusao)],
        ["Concluídos sem inauguração confirmada", sum(1 for a in concluidos if a.inauguracao_real is None)],
        ["Em andamento com previsão vigente", contar("Em andamento, previsão vigente")],
        ["Em andamento com previsão vencida", contar("Em andamento, previsão vencida")],
        ["Em andamento sem previsão (lacuna de cadastro)", contar("Em andamento, sem previsão")],
        ["Não iniciados", contar("Não iniciado")],
    ]


def linhas_agenda(agenda: Sequence[AgendaInstrumento], hoje: date) -> list[list[object]]:
    return [
        [
            a.instrumento.instrumento.nr_convenio,
            a.instrumento.instrumento.nome_convenente,
            capitalizar_nome(a.instrumento.instrumento.municipio),
            a.instrumento.instrumento.uf,
            a.instrumento.instrumento.tipo_contratacao,
            a.instrumento.fase_atual,
            a.situacao,
            a.conclusao,
            a.inauguracao_real,
            a.previsao,
            a.dias_ate_previsao(hoje),
        ]
        for a in agenda
    ]


COLUNAS_PROXIMAS = ["Instrumento", "Instituição", "Município/UF", "Previsão de inauguração", "Dias"]


def proximas_previsoes(
    agenda: Sequence[AgendaInstrumento], hoje: date, *, vencidas: bool, limite: int = 15
) -> list[list[object]]:
    """Previsões ainda abertas, da mais próxima à mais distante; `vencidas=True` lista as que já passaram."""
    candidatas = [
        a
        for a in agenda
        if a.previsao is not None and a.inauguracao_real is None and a.instrumento.fase_atual != CONCLUIDO
        if (a.previsao < hoje) == vencidas
    ]
    candidatas.sort(key=lambda a: a.previsao)  # type: ignore[arg-type,return-value]
    return [
        [
            a.instrumento.instrumento.nr_convenio,
            a.instrumento.instrumento.nome_convenente,
            f"{capitalizar_nome(a.instrumento.instrumento.municipio) or '—'}/{a.instrumento.instrumento.uf or '—'}",
            a.previsao,
            a.dias_ate_previsao(hoje),
        ]
        for a in candidatas[:limite]
    ]
