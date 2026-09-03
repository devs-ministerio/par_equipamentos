"""Monitoramento de equipamento pos-repasse -- esforco separado da analise
de merito de hipo/hipersuficiencia (decisao 2026-09-03). Ver app/db/models.py
(secao 8) pro desenho (instrumento_equipamento / marco_catalogo /
evento_marco, log append-only).

So 1 instrumento por enquanto (convenio 948686, ver
scripts/seed_monitoramento.py) -- decisao deliberada do usuario pra validar
o desenho antes de escalar pros 71. Sem autenticacao ainda (`autor` e texto
livre no corpo do evento) -- login fica pra uma fase posterior, decisao do
usuario 2026-09-03.
"""
from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo, MarcoGrupo

router = APIRouter(prefix="/monitoramento", tags=["monitoramento"])


class MarcoCatalogoRead(BaseModel):
    id: int
    codigo: str
    grupo: MarcoGrupo
    ordem: int | None
    execucao_fisica_pct_referencia: float | None
    rotulo: str
    descricao_referencia: str | None

    model_config = ConfigDict(from_attributes=True)


class EventoMarcoRead(BaseModel):
    id: int
    marco_id: int
    data_ocorrencia: date | None
    data_prevista: date | None
    status_regulatorio: str | None
    observacao: str | None
    autor_nome: str | None  # texto livre por enquanto -- ver EventoMarcoCreate
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventoMarcoCreate(BaseModel):
    marco_id: int
    data_ocorrencia: date | None = None
    data_prevista: date | None = None
    status_regulatorio: str | None = None
    observacao: str | None = None
    # Texto livre por enquanto (nome de quem esta lancando) -- vira FK real
    # pro usuario autenticado quando o login entrar. Guardado dentro de
    # `observacao` com prefixo ate existir coluna propria seria gambiarra;
    # em vez disso o front manda junto e o router prefixa na observacao de
    # forma explicita (ver `_compor_observacao`), deixando claro no dado que
    # e um valor auto-declarado, nao autenticado.
    autor_nome: str


class InstrumentoEquipamentoRead(BaseModel):
    id: int
    nr_convenio: str
    cnpj_convenente: str
    nome_convenente: str
    municipio: str | None
    uf: str | None
    cnes: str | None
    equipamento_descricao: str | None
    programa: str | None
    tp_instrumento_programa: str | None
    componente: str | None
    ano_instrumento: int | None
    valor_global: float | None
    valor_repasse: float | None
    valor_contrapartida: float | None
    tecnico_titular: str | None
    tecnico_suplente: str | None
    nivel_monitoramento: str | None
    finalidade: str | None
    modalidade_onco: str | None

    model_config = ConfigDict(from_attributes=True)


class InstrumentoTimelineRead(BaseModel):
    instrumento: InstrumentoEquipamentoRead
    eventos: list[EventoMarcoRead]


def _compor_observacao(autor_nome: str, observacao: str | None) -> str:
    """Autoria auto-declarada (sem login ainda) fica sempre visivel junto do
    texto -- nunca silenciosa. Formato: "[Nome] texto". Trocar por FK real
    (autor_id) quando a autenticacao entrar e so parar de prefixar aqui,
    o dado historico ja gravado continua legivel do jeito que esta."""
    prefixo = f"[{autor_nome}]"
    return f"{prefixo} {observacao}" if observacao else prefixo


@router.get("/marcos", response_model=list[MarcoCatalogoRead])
def listar_marcos(db: Session = Depends(get_db)):
    return db.execute(select(MarcoCatalogo).order_by(MarcoCatalogo.grupo, MarcoCatalogo.ordem)).scalars().all()


@router.get("/instrumentos", response_model=list[InstrumentoEquipamentoRead])
def listar_instrumentos(db: Session = Depends(get_db)):
    return db.execute(select(InstrumentoEquipamento).order_by(InstrumentoEquipamento.nr_convenio)).scalars().all()


@router.get("/instrumentos/{nr_convenio}", response_model=InstrumentoTimelineRead)
def obter_timeline(nr_convenio: str, db: Session = Depends(get_db)):
    instrumento = db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()
    if instrumento is None:
        raise HTTPException(404, f"Instrumento {nr_convenio} não monitorado.")
    eventos = db.execute(
        select(EventoMarco)
        .where(EventoMarco.instrumento_id == instrumento.id)
        .order_by(EventoMarco.created_at.desc())
    ).scalars().all()
    return InstrumentoTimelineRead(
        instrumento=InstrumentoEquipamentoRead.model_validate(instrumento),
        eventos=[
            EventoMarcoRead(
                id=e.id, marco_id=e.marco_id, data_ocorrencia=e.data_ocorrencia,
                data_prevista=e.data_prevista, status_regulatorio=e.status_regulatorio,
                observacao=e.observacao, autor_nome=None, created_at=e.created_at,
            )
            for e in eventos
        ],
    )


@router.post("/instrumentos/{nr_convenio}/eventos", response_model=EventoMarcoRead, status_code=201)
def registrar_evento(nr_convenio: str, corpo: EventoMarcoCreate, db: Session = Depends(get_db)):
    """Append-only -- sempre INSERT, nunca UPDATE (ver comentario em
    EventoMarco). Corrigir um lançamento errado e lançar um evento novo."""
    instrumento = db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()
    if instrumento is None:
        raise HTTPException(404, f"Instrumento {nr_convenio} não monitorado.")
    marco = db.get(MarcoCatalogo, corpo.marco_id)
    if marco is None:
        raise HTTPException(422, f"Marco {corpo.marco_id} não existe no catálogo.")

    evento = EventoMarco(
        instrumento_id=instrumento.id,
        marco_id=corpo.marco_id,
        data_ocorrencia=corpo.data_ocorrencia,
        data_prevista=corpo.data_prevista,
        status_regulatorio=corpo.status_regulatorio,
        observacao=_compor_observacao(corpo.autor_nome, corpo.observacao),
        autor_id=None,
    )
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return EventoMarcoRead(
        id=evento.id, marco_id=evento.marco_id, data_ocorrencia=evento.data_ocorrencia,
        data_prevista=evento.data_prevista, status_regulatorio=evento.status_regulatorio,
        observacao=evento.observacao, autor_nome=None, created_at=evento.created_at,
    )
