"""Avisos de prazo do monitoramento: ação aberta com prazo e previsão de inauguração ativa.

Janelas D-1, D0 e D+1 (um aviso por janela, nunca repetido por dia). O horário das 08:00 de São Paulo é do
agendador; aqui só vale a data de São Paulo. Chave de deduplicação: `tipo:referência:data do prazo:janela`.
Concluir, excluir, corrigir ou reagendar torna os avisos antigos inválidos: são arquivados para todos os
destinatários. Destinatários: titular, suplente, gestor e admin ativos (`resolver_destinatarios`).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    AcaoMonitoramento,
    InstrumentoEquipamento,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
)
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import criar_notificacao

FUSO = ZoneInfo("America/Sao_Paulo")
MARCO_INAUGURACAO = "cronograma_previsao_inauguracao"
JANELAS = {1: "D-1", 0: "D0", -1: "D+1"}
_QUANDO = {"D-1": "vence amanhã", "D0": "vence hoje", "D+1": "venceu ontem"}
_QUANDO_INAUG = {"D-1": "é amanhã", "D0": "é hoje", "D+1": "era ontem"}
_TIPOS = (NotificacaoTipo.prazo_acao, NotificacaoTipo.prazo_inauguracao)
_LOCK = "job_prazos_monitoramento"


def hoje_em_sao_paulo() -> date:
    return datetime.now(FUSO).date()


@dataclass
class Resultado:
    avisos: Counter[str] = field(default_factory=Counter)
    ja_emitidos: int = 0
    arquivados: int = 0
    bloqueado: bool = False


@dataclass(frozen=True)
class _Prazo:
    tipo: NotificacaoTipo
    referencia: str  # "acao:12" ou "inauguracao:3"
    instrumento_id: int
    nr_convenio: str
    data: date
    titulo_base: str
    detalhe: str | None


def _prazos_vigentes(db: Session) -> list[_Prazo]:
    instrumentos = {i.id: i.nr_convenio for i in db.execute(select(InstrumentoEquipamento)).scalars()}
    prazos: list[_Prazo] = []
    acoes = db.execute(
        select(AcaoMonitoramento).where(
            AcaoMonitoramento.data_prevista.is_not(None),
            AcaoMonitoramento.data_conclusao.is_(None),
            AcaoMonitoramento.deletado_em.is_(None),
            AcaoMonitoramento.substituido_por_id.is_(None),
        )
    ).scalars()
    for acao in acoes:
        if acao.data_prevista is None or acao.instrumento_id not in instrumentos:
            continue
        prazos.append(
            _Prazo(
                NotificacaoTipo.prazo_acao,
                f"acao:{acao.id}",
                acao.instrumento_id,
                instrumentos[acao.instrumento_id],
                acao.data_prevista,
                "Ação",
                acao.descricao[:200],
            )
        )
    marco = monitoramento_repo.obter_marco_por_codigo(db, MARCO_INAUGURACAO)
    if marco is not None:
        for instrumento_id, nr in instrumentos.items():
            evento = monitoramento_repo.obter_evento_mais_recente_do_marco(
                db, instrumento_id=instrumento_id, marco_id=marco.id
            )
            if evento is not None and evento.data_prevista is not None and evento.data_ocorrencia is None:
                prazos.append(
                    _Prazo(
                        NotificacaoTipo.prazo_inauguracao,
                        f"inauguracao:{instrumento_id}",
                        instrumento_id,
                        nr,
                        evento.data_prevista,
                        "Inauguração",
                        None,
                    )
                )
    return prazos


def _chave(prazo: _Prazo, janela: str) -> str:
    return f"{prazo.tipo.value}:{prazo.referencia}:{prazo.data.isoformat()}:{janela}"


def _arquivar_obsoletos(db: Session, prazos: list[_Prazo], resultado: Resultado, aplicar: bool) -> None:
    vigente = {(p.tipo.value, p.referencia): p.data.isoformat() for p in prazos}
    existentes = db.execute(
        select(Notificacao.id, Notificacao.chave_dedup).where(
            Notificacao.tipo.in_(_TIPOS), Notificacao.chave_dedup.is_not(None)
        )
    ).all()
    obsoletos = []
    for notificacao_id, chave in existentes:
        tipo, kind, ref_id, data, _janela = str(chave).split(":")
        if vigente.get((tipo, f"{kind}:{ref_id}")) != data:
            obsoletos.append(notificacao_id)
    if not obsoletos:
        return
    pendentes = (
        db.execute(
            select(NotificacaoDestinatario.id).where(
                NotificacaoDestinatario.notificacao_id.in_(obsoletos), NotificacaoDestinatario.arquivada.is_(False)
            )
        )
        .scalars()
        .all()
    )
    resultado.arquivados = len(pendentes)
    if aplicar and pendentes:
        db.execute(
            update(NotificacaoDestinatario).where(NotificacaoDestinatario.id.in_(pendentes)).values(arquivada=True)
        )


def executar(db: Session, *, hoje: date, aplicar: bool) -> Resultado:
    resultado = Resultado()
    if aplicar and not db.execute(text("SELECT pg_try_advisory_xact_lock(hashtext(:k))"), {"k": _LOCK}).scalar():
        resultado.bloqueado = True
        return resultado
    prazos = _prazos_vigentes(db)
    _arquivar_obsoletos(db, prazos, resultado, aplicar)
    devidos = [(p, JANELAS[(p.data - hoje).days]) for p in prazos if (p.data - hoje).days in JANELAS]
    if not devidos:
        return resultado
    ja = set(
        db.execute(
            select(Notificacao.chave_dedup).where(Notificacao.chave_dedup.in_([_chave(p, j) for p, j in devidos]))
        ).scalars()
    )
    for prazo, janela in devidos:
        chave = _chave(prazo, janela)
        if chave in ja:
            resultado.ja_emitidos += 1
            continue
        resultado.avisos[janela] += 1
        if not aplicar:
            continue
        quando = (_QUANDO if prazo.tipo == NotificacaoTipo.prazo_acao else _QUANDO_INAUG)[janela]
        titulo = (
            f"{prazo.titulo_base} {quando} — {prazo.nr_convenio}"
            if prazo.tipo == NotificacaoTipo.prazo_acao
            else f"{prazo.titulo_base} prevista {quando} — {prazo.nr_convenio}"
        )
        try:
            with db.begin_nested():
                criar_notificacao(
                    db,
                    Notificacao(
                        tipo=prazo.tipo,
                        titulo=titulo,
                        corpo=prazo.detalhe or f"Data prevista: {prazo.data:%d/%m/%Y}.",
                        entidade_id=prazo.instrumento_id,
                        chave_dedup=chave,
                    ),
                )
        except IntegrityError:
            resultado.ja_emitidos += 1  # outra execução gravou a mesma chave primeiro
            resultado.avisos[janela] -= 1
    return resultado
