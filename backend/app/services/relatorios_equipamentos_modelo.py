"""Extração, linhas e legenda do relatório de Equipamentos."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.pipeline.texto import normalizar_texto
from app.repositories import itens_equipamento
from app.repositories import relatorios_contexto as repo
from app.repositories.relatorios_entregues import listar_unidades_entregues
from app.schemas_monitoramento import EtapasInstrumentoRead
from app.services.monitoramento_instrumentos import InstrumentoComFase
from app.services.relatorios_contexto import carregar_contextos
from app.services.relatorios_equipamentos_resumo import (
    ROTULOS,
    FatoEquipamento,
    SituacaoEquipamento,
    resumo_equipamentos,
)
from app.services.relatorios_filtro import FiltroRelatorio
from app.services.relatorios_inauguracao import inauguracao_da_linha
from app.services.relatorios_modelo import (
    Celula,
    RelatorioMonitorado,
    cabecalho,
    descrever_filtros,
    exibir_instrumento,
)

FONTE = "SISGEO · SICONV · RENEM · CNES"

COLUNAS_EQUIPAMENTO_SIMPLIFICADO = (
    "Instrumento",
    "CNES",
    "Estabelecimento de Saúde",
    "Município",
    "UF",
    "Região",
    "Equipamento",
    "Situação (Equipamento)",
    "Situação (Site)",
    "Situação (Monitoramento)",
    "Qtd",
    "Valor do Equipamento",
    "Data de Entrega do Equipamento",
    "Data de Previsão/Inauguração",
    "Status da Inauguração",
    "Técnico Responsável",
)
COLUNAS_EQUIPAMENTO_COMPLETO = (
    "Instrumento",
    "CNES",
    "Estabelecimento de Saúde",
    "Município",
    "UF",
    "Região",
    "Contratação",
    "Equipamento",
    "Descrição do item no plano",
    "Situação (Equipamento)",
    "Situação (Site)",
    "Situação (Monitoramento)",
    "Qtd",
    "Valor do Equipamento",
    "Data de Entrega do Equipamento",
    "Data de Previsão/Inauguração",
    "Status da Inauguração",
    "Nº do Processo",
    "Ano do Instrumento",
    "Início da Vigência",
    "Fim da Vigência",
    "Marca",
    "Modelo",
    "Série",
    "Técnico Responsável",
)
DATAS = ("Data de Entrega do Equipamento", "Data de Previsão/Inauguração", "Início da Vigência", "Fim da Vigência")
MOEDA = ("Valor do Equipamento",)

LEGENDA_EQUIPAMENTOS = (
    ("Situação (Site)", "Situação oficial do instrumento."),
    ("Situação (Monitoramento)", "Fase do acompanhamento interno."),
    (
        "Data de Previsão/Inauguração",
        "Em operação: inauguração realizada. Demais situações: previsão, se houver.",
    ),
    ("Status da Inauguração", "Realizada, Prevista, Dispensada ou Pela entrega."),
    (
        "Nota",
        "Alguns equipamentos podem ter a inauguração dispensada. Eles contam como Em operação e ficam sem data.",
    ),
)


def linha_equipamento(f: FatoEquipamento, *, completo: bool) -> tuple[Celula, ...]:
    c = f.contexto
    base = (exibir_instrumento(c.numero), c.cnes, c.estabelecimento, c.municipio, c.uf, c.regiao)
    situacoes = (ROTULOS[f.situacao], c.situacao_site, c.situacao_monitoramento)
    datas = (f.data_entrega, f.data_previsao_inauguracao, f.status_inauguracao)
    if not completo:
        return (*base, f.equipamento, *situacoes, f.quantidade, f.valor, *datas, c.tecnico)
    return (
        *base,
        c.contratacao,
        f.equipamento,
        f.descricao_item,
        *situacoes,
        f.quantidade,
        f.valor,
        *datas,
        c.numero_processo,
        c.ano,
        c.inicio_vigencia,
        c.fim_vigencia,
        f.marca,
        f.modelo,
        f.serie,
        c.tecnico,
    )


def _unidades_por_familia(db: Session, ids: set[int], selecionadas: set[str]) -> dict[tuple[str, str], list[dict]]:
    unidades: dict[tuple[str, str], list[dict]] = {}
    if ids and selecionadas.intersection({"entregue", "em_operacao"}):
        for u in listar_unidades_entregues(db, instrumento_ids=ids):
            familia = u["familia"] or itens_equipamento.ROTULO_FAMILIA_POR_VALOR
            unidades.setdefault((u["instrumento"], familia), []).append(u)
    return unidades


@dataclass(frozen=True)
class _Carga:
    """Dados já carregados que a montagem dos fatos consulta linha a linha."""

    contextos: dict
    descricoes: dict
    por_familia: dict
    por_item: dict
    unidades: dict[tuple[str, str], list[dict]]
    selecionadas: set[str]
    completo: bool


def _fato_por_unidade(carga: _Carga, fato: Callable[..., FatoEquipamento], u: dict) -> FatoEquipamento:
    return fato(
        descricao_item=u["descricao_item"],
        quantidade=1,
        valor=carga.por_item.get(u["item_id"]),
        data_entrega=u["data_entrega"],
        marca=u["marca"],
        modelo=u["modelo"],
        serie=u["numero_serie"],
    )


def _fato_agregado(
    carga: _Carga,
    fato: Callable[..., FatoEquipamento],
    *,
    identificador: int,
    familia: str,
    quantidade: int,
    da_familia: list[dict],
    entrega: bool,
) -> FatoEquipamento:
    datas = [u["data_entrega"] for u in da_familia if u["data_entrega"]]
    agregado = carga.por_familia.get((identificador, familia))
    return fato(
        descricao_item=carga.descricoes.get((identificador, familia)),
        quantidade=quantidade,
        valor=agregado[0] * quantidade / agregado[1] if agregado else None,
        data_entrega=min(datas) if datas and not carga.completo and entrega else None,
    )


def _fatos_da_familia(
    carga: _Carga,
    *,
    identificador: int,
    numero: str,
    familia: str,
    quantidades_origem: tuple[int, int, int],
    etapa: EtapasInstrumentoRead,
) -> list[FatoEquipamento]:
    planejado, entregue, cancelado = quantidades_origem
    situacao_entrega: SituacaoEquipamento = "em_operacao" if etapa.modo_operacao is not None else "entregue"
    quantidades: dict[SituacaoEquipamento, int] = {
        "planejado": max(0, planejado - entregue),
        situacao_entrega: entregue,
        "cancelado": cancelado,
    }
    da_familia, fatos = carga.unidades.get((numero, familia), []), list[FatoEquipamento]()
    for situacao, quantidade in quantidades.items():
        if situacao not in carga.selecionadas or quantidade <= 0:
            continue
        previsao, status = inauguracao_da_linha(etapa, situacao)

        def fato(situacao=situacao, previsao=previsao, status=status, **resto):
            return FatoEquipamento(
                contexto=carga.contextos[numero],
                equipamento=familia,
                situacao=situacao,
                data_previsao_inauguracao=previsao,
                status_inauguracao=status,
                **resto,
            )

        if carga.completo and situacao == situacao_entrega:
            detalhadas = da_familia[:quantidade]
            fatos.extend(_fato_por_unidade(carga, fato, u) for u in detalhadas)
            quantidade -= len(detalhadas)
            if quantidade == 0:
                continue
        fatos.append(
            _fato_agregado(
                carga,
                fato,
                identificador=identificador,
                familia=familia,
                quantidade=quantidade,
                da_familia=da_familia,
                entrega=situacao == situacao_entrega,
            )
        )
    return fatos


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
    selecionadas: set[str] = set(situacoes or ROTULOS)
    carga = _Carga(
        contextos=carregar_contextos(db, recorte),
        descricoes=repo.descricoes_por_familia(db, ids),
        por_familia=repo.valores_por_familia(db, ids),
        por_item=repo.valor_unitario_por_item(db, ids),
        unidades=_unidades_por_familia(db, ids, selecionadas),
        selecionadas=selecionadas,
        completo=completo,
    )
    alvo = normalizar_texto(equipamento)
    fatos: list[FatoEquipamento] = []
    for (
        identificador,
        familia,
        planejado,
        entregue,
        cancelado,
    ) in itens_equipamento.resumo_com_cancelamentos_por_familia(db, ids):
        if alvo and normalizar_texto(familia) != alvo:
            continue
        numero = numero_por_id[identificador]
        fatos.extend(
            _fatos_da_familia(
                carga,
                identificador=identificador,
                numero=numero,
                familia=familia,
                quantidades_origem=(planejado, entregue, cancelado),
                etapa=etapas.get(numero) or EtapasInstrumentoRead(nr_convenio=numero),
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
        cabecalho(
            filtro,
            referencia=referencia,
            fonte=FONTE,
            filtros=descrever_filtros(filtro, situacoes=rotulos, contratacoes=(f.contexto.contratacao for f in fatos)),
        ),
        indicadores,
        quebras,
        (),
        LEGENDA_EQUIPAMENTOS,
        DATAS,
        MOEDA,
        "equipamentos",
    )
