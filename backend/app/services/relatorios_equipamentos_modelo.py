"""Linhas, resumo e legenda do relatório de Equipamentos."""

from collections import Counter
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from sqlalchemy.orm import Session

from app.pipeline.texto import normalizar_texto
from app.repositories import itens_equipamento
from app.repositories import relatorios_contexto as repo
from app.repositories.relatorios_entregues import listar_unidades_entregues
from app.schemas_monitoramento import EtapasInstrumentoRead
from app.services.monitoramento_instrumentos import InstrumentoComFase
from app.services.relatorios_contexto import carregar_contextos
from app.services.relatorios_filtro import FiltroRelatorio
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

SituacaoEquipamento = Literal["planejado", "entregue", "em_operacao", "cancelado"]
ROTULOS: dict[SituacaoEquipamento, str] = {
    "planejado": "Planejado",
    "entregue": "Entregue, a inaugurar",
    "em_operacao": "Em operação",
    "cancelado": "Cancelado",
}
ORDEM_SITUACAO = tuple(ROTULOS.values())
FONTE = "SISGEO · SICONV · RENEM · CNES"

COLUNAS_EQUIPAMENTO_SIMPLIFICADO = (
    "Instrumento", "CNES", "Estabelecimento de Saúde", "Município", "UF", "Região", "Equipamento",
    "Situação (Equipamento)", "Situação (Site)", "Situação (Monitoramento)", "Qtd", "Valor do Equipamento",
    "Data de Entrega do Equipamento", "Data de Previsão/Inauguração", "Status da Inauguração", "Técnico Responsável",
)
COLUNAS_EQUIPAMENTO_COMPLETO = (
    "Instrumento", "CNES", "Estabelecimento de Saúde", "Município", "UF", "Região", "Contratação", "Equipamento",
    "Descrição do item no plano", "Situação (Equipamento)", "Situação (Site)", "Situação (Monitoramento)", "Qtd",
    "Valor do Equipamento", "Data de Entrega do Equipamento", "Data de Previsão/Inauguração",
    "Status da Inauguração", "Nº do Processo", "Ano do Instrumento", "Início da Vigência", "Fim da Vigência",
    "Marca", "Modelo", "Série", "Técnico Responsável",
)
DATAS = ("Data de Entrega do Equipamento", "Data de Previsão/Inauguração", "Início da Vigência", "Fim da Vigência")
MOEDA = ("Valor do Equipamento",)

LEGENDA_EQUIPAMENTOS = (
    ("Situação (Equipamento)", "Planejado, Entregue a inaugurar, Em operação ou Cancelado."),
    ("Situação (Site)", "Situação oficial do instrumento nos dados importados."),
    ("Situação (Monitoramento)", "Fase do acompanhamento interno."),
    ("Data de Entrega do Equipamento", "Data em que o equipamento foi entregue. Vazia se ainda não entregue."),
    (
        "Data de Previsão/Inauguração",
        "Em operação: inauguração realizada. Entregue a inaugurar e Planejado: previsão, se houver.",
    ),
    ("Status da Inauguração", "Realizada, Prevista, Dispensada ou Pela entrega."),
    (
        "Nota",
        "Alguns equipamentos podem ter a inauguração dispensada. Eles contam como Em operação e ficam sem data.",
    ),
)


@dataclass(frozen=True)
class FatoEquipamento:
    contexto: ContextoInstrumento
    equipamento: str
    descricao_item: str | None
    situacao: str
    quantidade: int
    valor: float | None
    data_entrega: date | None
    data_previsao_inauguracao: date | None
    status_inauguracao: str | None
    marca: str | None = None
    modelo: str | None = None
    serie: str | None = None


def linha_equipamento(f: FatoEquipamento, *, completo: bool) -> tuple[Celula, ...]:
    c = f.contexto
    base = (c.numero, c.cnes, c.estabelecimento, c.municipio, c.uf, c.regiao)
    situacoes = (ROTULOS[f.situacao], c.situacao_site, c.situacao_monitoramento)  # type: ignore[index]
    datas = (f.data_entrega, f.data_previsao_inauguracao, f.status_inauguracao)
    if not completo:
        return (*base, f.equipamento, *situacoes, f.quantidade, f.valor, *datas, c.tecnico)
    return (
        *base, c.contratacao, f.equipamento, f.descricao_item, *situacoes, f.quantidade, f.valor, *datas,
        c.numero_processo, c.ano, c.inicio_vigencia, c.fim_vigencia, f.marca, f.modelo, f.serie, c.tecnico,
    )


def _geografia(fatos: list[FatoEquipamento], escopo: str) -> Tabela:
    def repetir(chave) -> list[str]:
        return [chave(f) for f in fatos for _ in range(f.quantidade)]

    if escopo in ("municipio", "cnes"):
        return quebra_por(
            "Por estabelecimento", "Estabelecimento de Saúde", repetir(lambda f: f.contexto.estabelecimento or "")
        )
    if escopo == "brasil":
        regioes = quebra_por("Por região", "Região", repetir(lambda f: f.contexto.regiao or ""))
        return Tabela("Por UF", regioes.colunas, regioes.linhas)
    return quebra_por("Por UF", "UF", repetir(lambda f: f.contexto.uf or ""))


def resumo_equipamentos(
    fatos: list[FatoEquipamento], *, escopo: str, referencia: date
) -> tuple[tuple[tuple[str, Celula], ...], tuple[Tabela, ...]]:
    por_situacao: Counter[str] = Counter()
    aceleradores: Counter[str] = Counter()
    for f in fatos:
        por_situacao[ROTULOS[f.situacao]] += f.quantidade  # type: ignore[index]
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
            [ROTULOS[f.situacao] for f in fatos for _ in range(f.quantidade)],  # type: ignore[index]
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

    def soma(*situacoes: str) -> float:
        return sum(v for s, v in com_valor if s in situacoes and v is not None)

    linhas: list[tuple[Celula, ...]] = [
        ("Planejado", soma("planejado")),
        ("Entregue", soma("entregue", "em_operacao")),
    ]
    if cancelado := soma("cancelado"):
        linhas.append(("Cancelado", cancelado))
    return Tabela("Valor do equipamento", ("Situação", "Valor"), linhas, colunas_moeda=("Valor",))


def _unidades_por_familia(db: Session, ids: set[int], selecionadas: set[str]) -> dict[tuple[str, str], list[dict]]:
    unidades: dict[tuple[str, str], list[dict]] = {}
    if ids and selecionadas.intersection({"entregue", "em_operacao"}):
        for u in listar_unidades_entregues(db, instrumento_ids=ids):
            familia = u["familia"] or itens_equipamento.ROTULO_FAMILIA_POR_VALOR
            unidades.setdefault((u["instrumento"], familia), []).append(u)
    return unidades


def _fatos_equipamentos(
    db: Session,
    recorte: list[InstrumentoComFase],
    etapas: dict[str, EtapasInstrumentoRead],
    situacoes: tuple[SituacaoEquipamento, ...],
    completo: bool,
    equipamento: str | None,
) -> list[FatoEquipamento]:
    numero_por_id = {i.instrumento.id: i.instrumento.nr_convenio for i in recorte}
    ids = set(numero_por_id)
    contextos = carregar_contextos(db, recorte)
    descricoes = repo.descricoes_por_familia(db, ids)
    por_familia = repo.valores_por_familia(db, ids)
    por_item = repo.valor_unitario_por_item(db, ids)
    selecionadas: set[str] = set(situacoes or ROTULOS)
    unidades = _unidades_por_familia(db, ids, selecionadas)
    alvo = normalizar_texto(equipamento)
    fatos: list[FatoEquipamento] = []
    for identificador, familia, planejado, entregue, cancelado in itens_equipamento.resumo_com_cancelamentos_por_familia(
        db, ids
    ):
        if alvo and normalizar_texto(familia) != alvo:
            continue
        numero = numero_por_id[identificador]
        etapa = etapas.get(numero) or EtapasInstrumentoRead(nr_convenio=numero)
        situacao_entrega: SituacaoEquipamento = "em_operacao" if etapa.modo_operacao is not None else "entregue"
        quantidades: dict[SituacaoEquipamento, int] = {
            "planejado": max(0, planejado - entregue),
            situacao_entrega: entregue,
            "cancelado": cancelado,
        }
        da_familia = unidades.get((numero, familia), [])
        for situacao, quantidade in quantidades.items():
            if situacao not in selecionadas or quantidade <= 0:
                continue
            previsao, status = inauguracao_da_linha(etapa, situacao)

            def fato(situacao=situacao, numero=numero, familia=familia, previsao=previsao, status=status, **resto):
                return FatoEquipamento(
                    contexto=contextos[numero], equipamento=familia, situacao=situacao,
                    data_previsao_inauguracao=previsao, status_inauguracao=status, **resto,
                )

            if completo and situacao == situacao_entrega:
                fatos.extend(
                    fato(
                        descricao_item=u["descricao_item"], quantidade=1,
                        valor=por_item.get(u["item_id"]), data_entrega=u["data_entrega"],
                        marca=u["marca"], modelo=u["modelo"], serie=u["numero_serie"],
                    )
                    for u in da_familia
                )
                continue
            datas = [u["data_entrega"] for u in da_familia if u["data_entrega"]]
            agregado = por_familia.get((identificador, familia))
            fatos.append(
                fato(
                    descricao_item=descricoes.get((identificador, familia)), quantidade=quantidade,
                    valor=agregado[0] * quantidade / agregado[1] if agregado else None,
                    data_entrega=min(datas) if datas and situacao == situacao_entrega else None,
                )
            )
    return fatos


def montar_equipamentos(
    *,
    db: Session,
    recorte: list[InstrumentoComFase],
    etapas: dict[str, EtapasInstrumentoRead],
    filtro: FiltroRelatorio,
    situacoes: tuple[SituacaoEquipamento, ...],
    completo: bool,
    referencia: date,
) -> RelatorioMonitorado:
    fatos = _fatos_equipamentos(db, recorte, etapas, situacoes, completo, filtro.equipamento)
    indicadores, quebras = resumo_equipamentos(fatos, escopo=filtro.escopo, referencia=referencia)
    rotulos = tuple(ROTULOS[s] for s in dict.fromkeys(situacoes))
    return RelatorioMonitorado(
        "Equipamentos",
        COLUNAS_EQUIPAMENTO_COMPLETO if completo else COLUNAS_EQUIPAMENTO_SIMPLIFICADO,
        [linha_equipamento(f, completo=completo) for f in fatos],
        sum(f.quantidade for f in fatos),
        "unidades",
        rotulos,
        cabecalho(filtro, referencia=referencia, fonte=FONTE, filtros=descrever_filtros(filtro, situacoes=rotulos)),
        indicadores,
        quebras,
        (),
        LEGENDA_EQUIPAMENTOS,
        DATAS,
        MOEDA,
        "equipamentos",
    )
