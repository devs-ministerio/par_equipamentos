"""Casos de uso de instrumentos monitorados."""
from __future__ import annotations

from dataclasses import asdict, dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_monitoramento
from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo, User
from app.domain_errors import NotFoundError
from app.repositories import monitoramento as monitoramento_repo


@dataclass(frozen=True)
class NovoInstrumentoMonitorado:
    nr_convenio: str
    cnpj_convenente: str | None
    nome_convenente: str
    tipo_contratacao: str
    municipio: str | None = None
    uf: str | None = None
    cnes: str | None = None
    programa: str | None = None
    tp_instrumento_programa: str | None = None
    componente: str | None = None
    ano_instrumento: int | None = None
    tecnico_titular: str | None = None
    tecnico_suplente: str | None = None
    nivel_monitoramento: str | None = None
    modalidade_onco: str | None = None
    responsavel_execucao_nome: str | None = None
    responsavel_execucao_contato: str | None = None
    situacao_prestacao_contas: str | None = None
    origem_dado: str | None = None
    tipologia: str | None = None
    investimento_aquisicao: float | None = None
    situacao_programa: str | None = None
    natureza_servico: str | None = None


def criar_instrumento_monitorado(
    *,
    dados: NovoInstrumentoMonitorado,
    db: Session,
    usuario: User,
) -> InstrumentoEquipamento:
    assert_pode_editar_monitoramento(usuario)
    ja_existe = db.execute(
        select(InstrumentoEquipamento.id).where(InstrumentoEquipamento.nr_convenio == dados.nr_convenio)
    ).scalar_one_or_none()
    if ja_existe is not None:
        raise HTTPException(409, f"Já existe instrumento monitorado com nr_convenio={dados.nr_convenio}.")

    instrumento = InstrumentoEquipamento(**asdict(dados))
    db.add(instrumento)
    db.flush()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="instrumento_equipamento",
        entity_id=instrumento.id,
        action="created",
        details={
            "nr_convenio": dados.nr_convenio,
            "tipo_contratacao": dados.tipo_contratacao,
            "tecnico_titular": dados.tecnico_titular,
        },
    )
    return instrumento


@dataclass(frozen=True)
class InstrumentoComFase:
    instrumento: InstrumentoEquipamento
    fase_atual: str


def _fase_atual_id(fases_gerais_desc: list[MarcoCatalogo], marco_ids_com_evento: set[int]) -> int | None:
    """Percorre os marcos de fase_geral do mais avançado (`ordem` desc) pro
    menos avançado -- o primeiro com evento registrado É a fase atual.
    Nenhum encontrado -> instrumento ainda não iniciou nenhuma fase."""
    for marco in fases_gerais_desc:
        if marco.id in marco_ids_com_evento:
            return marco.id
    return None


def listar_instrumentos_monitorados(*, db: Session, limit: int = 500) -> list[InstrumentoComFase]:
    """`fase_atual` calculado (achado 2026-09-10, pedido do usuario: filtro
    de fase na Visao Geral) -- mesmo padrao de calculo de `obter_resumo`
    (marco de fase_geral de maior ordem com evento), so que aqui devolvido
    POR instrumento em vez de agregado."""
    instrumentos = monitoramento_repo.listar_instrumentos(db, limit=limit)
    fases_gerais_desc = monitoramento_repo.listar_marcos_fase_geral_desc(db)
    fase_ids = [m.id for m in fases_gerais_desc]
    eventos_por_instrumento = monitoramento_repo.mapa_eventos_por_instrumento(db, fase_ids)

    resultado = []
    for inst in instrumentos:
        fase_atual_id = _fase_atual_id(fases_gerais_desc, eventos_por_instrumento.get(inst.id, set()))
        fase_atual = next((f.rotulo for f in fases_gerais_desc if f.id == fase_atual_id), "Não iniciado")
        resultado.append(InstrumentoComFase(instrumento=inst, fase_atual=fase_atual))
    return resultado


@dataclass(frozen=True)
class TimelineInstrumento:
    instrumento: InstrumentoEquipamento
    eventos: list[EventoMarco]


def obter_timeline_instrumento(*, db: Session, nr_convenio: str) -> TimelineInstrumento:
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    eventos = monitoramento_repo.listar_eventos_do_instrumento(db, instrumento.id)
    return TimelineInstrumento(instrumento=instrumento, eventos=eventos)
