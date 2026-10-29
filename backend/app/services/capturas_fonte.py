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

from sqlalchemy.orm import Session, sessionmaker

from app.db.base import SessionLocal
from app.db.models import FonteCaptura, Notificacao, NotificacaoTipo
from app.repositories.capturas_fonte import (
    adicionar_captura,
    existe_alerta_recente,
    listar_ultimas_tentativas,
    listar_ultimos_sucessos,
)
from app.repositories.notificacoes import criar_notificacao

ROTULOS_FONTE = {
    "cnes_tomografo": "Cobertura de tomógrafos",
    "cnes_ressonancia": "Cobertura de ressonância magnética",
    "cnes_pet_ct": "Cobertura de PET-CT",
    "populacao_ans": "Referência de população ANS",
    "alerta_vigencia": "Alertas de vigência",
    "siconv_legado": "SICONV (convênios legados)",
    "siconv_descoberta": "SICONV (descoberta de novos convênios)",
    "siconv_recaptura": "SICONV (recaptura para revisão do Radar)",
    "siconv_revalidacao": "SICONV (revalidação do escopo histórico do Radar)",
    "transferegov_verificacao": "TransfereGov (parcerias monitoradas)",
    "transferegov_descoberta": "TransfereGov (novas propostas)",
}
# Sem nova captura bem-sucedida por este tempo a fonte é exibida como defasada.
LIMITE_DEFASAGEM = timedelta(hours=36)
DEDUP_ALERTA = timedelta(hours=24)


def mensagem_publica_da_captura(status: str) -> str | None:
    """Não expor exceções, URLs com credenciais ou detalhes de infraestrutura."""
    if status == "ok":
        return None
    if status == "parcial":
        return "A fonte retornou dados incompletos. Os últimos dados confirmados foram preservados."
    return "Não foi possível concluir a coleta. Os últimos dados confirmados foram preservados."


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
            erro=mensagem_publica_da_captura(status),
            detalhes=detalhes,
        )
        adicionar_captura(db, captura)
        if status != "ok":
            _alertar_fonte_indisponivel(db, captura)
        db.commit()
        return captura.id
    finally:
        db.close()


def _alertar_fonte_indisponivel(db: Session, captura: FonteCaptura) -> None:
    recente = existe_alerta_recente(db, captura.fonte, datetime.now(UTC) - DEDUP_ALERTA)
    if recente:
        return
    rotulo = ROTULOS_FONTE.get(captura.fonte, captura.fonte)
    situacao = "respondeu de forma parcial" if captura.status == "parcial" else "ficou indisponível"
    corpo = (
        f"A coleta de {rotulo} {situacao}. Os últimos dados confirmados foram mantidos; "
        "nenhum valor foi apagado ou inferido."
    )
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
    except Exception:
        registrar_captura(
            fonte,
            iniciado_em=em_andamento.iniciado_em,
            status="erro",
            itens_verificados=em_andamento.itens_verificados,
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
    tentativas = listar_ultimas_tentativas(db)
    sucessos = listar_ultimos_sucessos(db, [tentativa.fonte for tentativa in tentativas])
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
