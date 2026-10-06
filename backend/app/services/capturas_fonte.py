"""Histórico, frescor e alerta de coleta das fontes oficiais.

Os jobs gravam cada rodada em sessão própria: se a transação de dados for
revertida por falha da fonte, o registro da falha permanece. Nada aqui apaga
ou sobrescreve dado confirmado; só descreve o que a rodada conseguiu obter.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import SessionLocal
from app.db.models import FonteCaptura, Notificacao, NotificacaoTipo
from app.repositories.notificacoes import criar_notificacao

ROTULOS_FONTE = {
    "siconv_legado": "SICONV (convênios legados)",
    "siconv_descoberta": "SICONV (descoberta de novos convênios)",
    "transferegov_verificacao": "TransfereGov (parcerias monitoradas)",
    "transferegov_descoberta": "TransfereGov (novas propostas)",
}
# Sem nova captura bem-sucedida por este tempo a fonte é exibida como defasada.
LIMITE_DEFASAGEM = timedelta(hours=36)
DEDUP_ALERTA = timedelta(hours=24)


@dataclass(frozen=True)
class SituacaoFonte:
    fonte: str
    rotulo: str
    ultima_tentativa: FonteCaptura
    ultimo_sucesso_em: datetime | None
    defasada: bool


def registrar_captura(
    fonte: str,
    *,
    iniciado_em: datetime,
    status: str,
    itens_verificados: int = 0,
    itens_alterados: int = 0,
    avisos_criados: int = 0,
    erro: str | None = None,
    detalhes: dict[str, Any] | None = None,
    fabrica_sessao: sessionmaker = SessionLocal,
) -> int:
    """Grava a rodada e, em falha/resposta parcial, avisa gestor/admin (1x/24h)."""
    db = fabrica_sessao()
    try:
        captura = FonteCaptura(
            fonte=fonte,
            iniciado_em=iniciado_em,
            finalizado_em=datetime.now(UTC),
            status=status,
            itens_verificados=itens_verificados,
            itens_alterados=itens_alterados,
            avisos_criados=avisos_criados,
            erro=erro[:1000] if erro else None,
            detalhes=detalhes,
        )
        db.add(captura)
        db.flush()
        if status != "ok":
            _alertar_fonte_indisponivel(db, captura)
        db.commit()
        return captura.id
    finally:
        db.close()


def _alertar_fonte_indisponivel(db: Session, captura: FonteCaptura) -> None:
    recente = db.execute(
        select(func.count())
        .select_from(Notificacao)
        .join(FonteCaptura, FonteCaptura.id == Notificacao.entidade_id)
        .where(
            Notificacao.tipo == NotificacaoTipo.fonte_indisponivel,
            FonteCaptura.fonte == captura.fonte,
            Notificacao.created_at >= datetime.now(UTC) - DEDUP_ALERTA,
        )
    ).scalar_one()
    if recente:
        return
    rotulo = ROTULOS_FONTE.get(captura.fonte, captura.fonte)
    situacao = "respondeu de forma parcial" if captura.status == "parcial" else "ficou indisponível"
    corpo = (
        f"A coleta de {rotulo} {situacao}. Os últimos dados confirmados foram mantidos; "
        "nenhum valor foi apagado ou inferido."
    )
    if captura.erro:
        corpo += f" Detalhe: {captura.erro}"
    criar_notificacao(
        db,
        Notificacao(
            tipo=NotificacaoTipo.fonte_indisponivel,
            titulo=f"Fonte oficial com problema: {rotulo}",
            corpo=corpo,
            entidade_id=captura.id,
        ),
    )


@dataclass
class CapturaEmAndamento:
    """Contadores que o job preenche; ``parcial`` marca resposta incompleta."""

    fonte: str
    iniciado_em: datetime
    itens_verificados: int = 0
    itens_alterados: int = 0
    avisos_criados: int = 0
    parcial: str | None = None
    detalhes: dict[str, Any] = field(default_factory=dict)


@contextmanager
def captura(fonte: str, *, fabrica_sessao: sessionmaker = SessionLocal) -> Iterator[CapturaEmAndamento]:
    """Registra a rodada como ok/parcial, ou erro se o corpo levantar.

    A exceção é sempre repropagada: o job continua falhando (workflow
    vermelho) e o registro do erro sobrevive ao rollback dos dados.
    """
    em_andamento = CapturaEmAndamento(fonte=fonte, iniciado_em=datetime.now(UTC))
    try:
        yield em_andamento
    except Exception as exc:
        registrar_captura(
            fonte,
            iniciado_em=em_andamento.iniciado_em,
            status="erro",
            itens_verificados=em_andamento.itens_verificados,
            erro=f"{type(exc).__name__}: {exc}",
            detalhes=em_andamento.detalhes or None,
            fabrica_sessao=fabrica_sessao,
        )
        raise
    registrar_captura(
        fonte,
        iniciado_em=em_andamento.iniciado_em,
        status="parcial" if em_andamento.parcial else "ok",
        itens_verificados=em_andamento.itens_verificados,
        itens_alterados=em_andamento.itens_alterados,
        avisos_criados=em_andamento.avisos_criados,
        erro=em_andamento.parcial,
        detalhes=em_andamento.detalhes or None,
        fabrica_sessao=fabrica_sessao,
    )


def situacao_das_fontes(db: Session, *, agora: datetime | None = None) -> list[SituacaoFonte]:
    agora = agora or datetime.now(UTC)
    ultimas = select(FonteCaptura.fonte, func.max(FonteCaptura.id).label("id")).group_by(FonteCaptura.fonte).subquery()
    tentativas = db.execute(select(FonteCaptura).join(ultimas, ultimas.c.id == FonteCaptura.id)).scalars().all()
    sucessos: dict[str, datetime] = {
        fonte: finalizado
        for fonte, finalizado in db.execute(
            select(FonteCaptura.fonte, func.max(FonteCaptura.finalizado_em))
            .where(FonteCaptura.status == "ok")
            .group_by(FonteCaptura.fonte)
        )
    }
    resultado = []
    for tentativa in sorted(tentativas, key=lambda t: t.fonte):
        ultimo_ok = sucessos.get(tentativa.fonte)
        resultado.append(
            SituacaoFonte(
                fonte=tentativa.fonte,
                rotulo=ROTULOS_FONTE.get(tentativa.fonte, tentativa.fonte),
                ultima_tentativa=tentativa,
                ultimo_sucesso_em=ultimo_ok,
                defasada=ultimo_ok is None or agora - ultimo_ok > LIMITE_DEFASAGEM,
            )
        )
    return resultado
