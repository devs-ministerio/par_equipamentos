"""Fatos classificados e indicadores do relatório de Equipamentos."""

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from app.services.relatorios_modelo import Celula, ContextoInstrumento, Tabela, quebra_por

SituacaoEquipamento = Literal["planejado", "entregue", "em_operacao", "cancelado"]
ROTULOS: dict[SituacaoEquipamento, str] = {
    "planejado": "Planejado",
    "entregue": "Entregue, a inaugurar",
    "em_operacao": "Em operação",
    "cancelado": "Cancelado",
}
ORDEM_SITUACAO = tuple(ROTULOS.values())


@dataclass(frozen=True)
class FatoEquipamento:
    contexto: ContextoInstrumento
    equipamento: str
    descricao_item: str | None
    situacao: SituacaoEquipamento
    quantidade: int
    valor: float | None
    data_entrega: date | None
    data_previsao_inauguracao: date | None
    status_inauguracao: str | None
    marca: str | None = None
    modelo: str | None = None
    serie: str | None = None


def _geografia(fatos: list[FatoEquipamento], escopo: str) -> Tabela:
    def repetir(chave: Callable[[FatoEquipamento], str]) -> list[str]:
        return [chave(f) for f in fatos for _ in range(f.quantidade)]

    if escopo in ("municipio", "cnes"):
        return quebra_por(
            "Por estabelecimento", "Estabelecimento de Saúde", repetir(lambda f: f.contexto.estabelecimento or "")
        )
    if escopo == "brasil":
        return quebra_por("Por região", "Região", repetir(lambda f: f.contexto.regiao or ""))
    return quebra_por("Por UF", "UF", repetir(lambda f: f.contexto.uf or ""))


def resumo_equipamentos(
    fatos: list[FatoEquipamento], *, escopo: str, referencia: date
) -> tuple[tuple[tuple[str, Celula], ...], tuple[Tabela, ...]]:
    por_situacao: Counter[str] = Counter()
    aceleradores: Counter[str] = Counter()
    for f in fatos:
        por_situacao[ROTULOS[f.situacao]] += f.quantidade
        if f.equipamento == "Acelerador Linear":
            aceleradores[f.situacao] += f.quantidade
    total_ac = sum(aceleradores.values())
    faltantes = aceleradores["planejado"] + aceleradores["entregue"]
    indicadores: tuple[tuple[str, Celula], ...] = (
        ("Unidades", sum(por_situacao.values())),
        *((r, por_situacao[r]) for r in ORDEM_SITUACAO),
        ("Aceleradores Lineares", f"{total_ac} ({aceleradores['em_operacao']} em operação, {faltantes} faltantes)"),
    )
    quebras = [
        quebra_por(
            "Por situação",
            "Situação (Equipamento)",
            [ROTULOS[f.situacao] for f in fatos for _ in range(f.quantidade)],
            ordem=ORDEM_SITUACAO,
        ),
        quebra_por("Por equipamento", "Equipamento", [f.equipamento for f in fatos for _ in range(f.quantidade)]),
        _geografia(fatos, escopo),
        quebra_por(
            "Por contratação", "Contratação", [f.contexto.contratacao or "" for f in fatos for _ in range(f.quantidade)]
        ),
    ]
    for opcional in (_agenda(fatos, referencia), _valores(fatos)):
        if opcional:
            quebras.append(opcional)
    return indicadores, tuple(quebras)


def _agenda(fatos: list[FatoEquipamento], referencia: date) -> Tabela | None:
    previstos: dict[str, date] = {}
    for f in fatos:
        if f.status_inauguracao == "Prevista" and f.data_previsao_inauguracao:
            previstos[f.contexto.numero] = f.data_previsao_inauguracao
    if not previstos:
        return None
    linhas: list[tuple[Celula, ...]] = [
        (f"Em {dias} dias", len([d for d in previstos.values() if referencia <= d <= referencia + timedelta(days=dias)]))
        for dias in (30, 60, 90)
    ]
    return Tabela("Agenda de inaugurações", ("Prazo", "Instrumentos"), linhas)


def _valores(fatos: list[FatoEquipamento]) -> Tabela | None:
    com_valor = [(f.situacao, f.valor) for f in fatos if f.valor is not None]
    if not com_valor:
        return None

    def soma(*situacoes: SituacaoEquipamento) -> float | None:
        valores = [v for s, v in com_valor if s in situacoes and v is not None]
        return sum(valores) if valores else None

    linhas: list[tuple[Celula, ...]] = [
        ("Planejado", soma("planejado")),
        ("Entregue", soma("entregue", "em_operacao")),
    ]
    if (cancelado := soma("cancelado")) is not None:
        linhas.append(("Cancelado", cancelado))
    return Tabela("Valor do equipamento", ("Situação", "Valor"), linhas, colunas_moeda=("Valor",))
