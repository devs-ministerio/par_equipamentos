"""Recorte e linhas compartilhados pela prévia e pelas exportações do monitoramento."""

from dataclasses import dataclass, replace
from datetime import date
from typing import Literal

from sqlalchemy.orm import Session

from app.domain_errors import ValidationError
from app.pipeline.texto import normalizar_texto
from app.repositories import itens_equipamento
from app.repositories.limites_relatorio import LimiteConsultaExcedido
from app.repositories.relatorios_entregues import listar_unidades_entregues
from app.services.fase_acompanhamento import FaseAcompanhamento
from app.services.fatos_instrumento import carregar_etapas
from app.services.relatorios_filtro import FiltroRelatorio, Nivel
from app.services.relatorios_recorte import _instrumentos

TipoMonitorado = Literal["equipamentos_monitorados", "instrumentos_monitorados"]
SituacaoEquipamento = Literal["planejado", "entregue", "em_operacao", "cancelado"]
Celula = str | int | date | None

TIPOS_MONITORADOS = ("equipamentos_monitorados", "instrumentos_monitorados")
ROTULOS: dict[SituacaoEquipamento, str] = {
    "planejado": "Planejado",
    "entregue": "Entregue, a inaugurar",
    "em_operacao": "Em operação",
    "cancelado": "Cancelado",
}
COLUNAS_BASE = ("Instrumento", "Instituição", "Município", "UF", "CNES", "Contratação")
COLUNAS_EQUIPAMENTO = (*COLUNAS_BASE, "Equipamento", "Situação", "Quantidade")
COLUNAS_UNIDADE = ("Item", "Data de entrega", "Marca", "Modelo", "Série")


@dataclass(frozen=True)
class RelatorioMonitorado:
    titulo: str
    colunas: tuple[str, ...]
    linhas: list[tuple[Celula, ...]]
    total: int
    unidade: str
    criterios: tuple[str, ...] = ()


def montar_relatorio_monitorado(
    *,
    db: Session,
    tipo: TipoMonitorado,
    nivel: Nivel,
    filtro: FiltroRelatorio,
    situacoes: tuple[SituacaoEquipamento, ...] = (),
    fases: tuple[FaseAcompanhamento, ...] = (),
) -> RelatorioMonitorado:
    try:
        return _montar(db, tipo, nivel, filtro, situacoes, fases)
    except LimiteConsultaExcedido as exc:
        raise ValidationError("O recorte excede o limite seguro. Refine os filtros e tente novamente.") from exc


def _montar(
    db: Session,
    tipo: TipoMonitorado,
    nivel: Nivel,
    filtro: FiltroRelatorio,
    situacoes: tuple[SituacaoEquipamento, ...],
    fases: tuple[FaseAcompanhamento, ...],
) -> RelatorioMonitorado:
    equipamentos = tipo == "equipamentos_monitorados"
    candidatos = _instrumentos(
        db,
        replace(
            filtro,
            ano_inicio=None,
            ano_fim=None,
            equipamento=None if equipamentos else filtro.equipamento,
            situacao_origem="monitoramento",
        ),
    )
    ano_inicio, ano_fim = filtro.ano_inicio, filtro.ano_fim
    fases_selecionadas = {fase.value for fase in fases} if not equipamentos else set()
    recorte = [
        i
        for i in candidatos
        if (not fases_selecionadas or i.fase_atual in fases_selecionadas)
        and (
            ano_inicio is None
            or (
                i.instrumento.ano_instrumento is not None
                and ano_fim is not None
                and ano_inicio <= i.instrumento.ano_instrumento <= ano_fim
            )
        )
    ]
    instrumentos = [i.instrumento for i in recorte]
    base = {
        i.nr_convenio: (i.nr_convenio, i.nome_convenente, i.municipio, i.uf, i.cnes, i.tipo_contratacao)
        for i in instrumentos
    }
    etapas = {e.nr_convenio: e for e in carregar_etapas(db=db, instrumentos=instrumentos)}
    completo = nivel == "completo"
    if not equipamentos:
        colunas: tuple[str, ...] = (*COLUNAS_BASE, "Fase")
        if completo:
            colunas = (*colunas, "Publicação", "Entrega", "Inauguração", "Conclusão")
        linhas: list[tuple[Celula, ...]] = []
        for candidato in recorte:
            numero = candidato.instrumento.nr_convenio
            linha: tuple[Celula, ...] = (*base[numero], candidato.fase_atual)
            if completo:
                etapa = etapas[numero]
                linha = (*linha, etapa.publicacao, etapa.entrega, etapa.inauguracao, etapa.conclusao)
            linhas.append(linha)
        return RelatorioMonitorado(
            "Instrumentos", colunas, linhas, len(linhas), "instrumentos", tuple(dict.fromkeys(f.value for f in fases))
        )

    numero_por_id = {i.id: i.nr_convenio for i in instrumentos}
    familias = itens_equipamento.resumo_com_cancelamentos_por_familia(db, set(numero_por_id))
    linhas_equipamentos, total = _linhas_equipamentos(
        db,
        familias,
        numero_por_id,
        base,
        {n for n, e in etapas.items() if e.modo_operacao is not None},
        situacoes,
        completo,
        filtro.equipamento,
    )
    return RelatorioMonitorado(
        "Equipamentos",
        (*COLUNAS_EQUIPAMENTO, *COLUNAS_UNIDADE) if completo else COLUNAS_EQUIPAMENTO,
        linhas_equipamentos,
        total,
        "unidades",
        tuple(ROTULOS[s] for s in dict.fromkeys(situacoes)),
    )


def _linhas_equipamentos(
    db: Session,
    familias: list[tuple[int, str, int, int, int]],
    numero_por_id: dict[int, str],
    base: dict[str, tuple],
    em_operacao: set[str],
    situacoes: tuple[SituacaoEquipamento, ...],
    completo: bool,
    equipamento: str | None,
) -> tuple[list[tuple[Celula, ...]], int]:
    alvo = normalizar_texto(equipamento)
    selecionadas = set(situacoes or ROTULOS)
    unidades: dict[tuple[str, str], list[dict]] = {}
    if completo and numero_por_id and selecionadas.intersection({"entregue", "em_operacao"}):
        for unidade in listar_unidades_entregues(db, instrumento_ids=set(numero_por_id)):
            familia = unidade["familia"] or itens_equipamento.ROTULO_FAMILIA_POR_VALOR
            unidades.setdefault((unidade["instrumento"], familia), []).append(unidade)
    linhas: list[tuple[Celula, ...]] = []
    total = 0
    for identificador, familia, planejado, entregue, cancelado in familias:
        if alvo and normalizar_texto(familia) != alvo:
            continue
        numero = numero_por_id[identificador]
        situacao_entrega: SituacaoEquipamento = "em_operacao" if numero in em_operacao else "entregue"
        quantidades: dict[SituacaoEquipamento, int] = {
            "planejado": max(0, planejado - entregue),
            situacao_entrega: entregue,
            "cancelado": cancelado,
        }
        for situacao, quantidade in quantidades.items():
            if situacao not in selecionadas or quantidade <= 0:
                continue
            total += quantidade
            prefixo = (*base[numero], familia, ROTULOS[situacao])
            if completo and situacao == situacao_entrega:
                linhas.extend(
                    (*prefixo, 1, u["descricao_item"], u["data_entrega"], u["marca"], u["modelo"], u["numero_serie"])
                    for u in unidades.get((numero, familia), [])
                )
            elif completo:
                linhas.append((*prefixo, quantidade, None, None, None, None, None))
            else:
                linhas.append((*prefixo, quantidade))
    return linhas, total
