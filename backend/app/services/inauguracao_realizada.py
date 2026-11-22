"""Registro da inauguração realizada no cronograma (marco `cronograma_previsao_inauguracao` com data de ocorrência).

Há no máximo uma inauguração ativa por instrumento: a realizada entra no lugar da previsão vigente (append-only).
Sem commit aqui: roda na transação de quem chama (conclusão do acompanhamento ou caminho antigo por evento)."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.audit import log_action
from app.db.models import EventoMarco, InstrumentoEquipamento, User
from app.domain_errors import ValidationError
from app.repositories import monitoramento as monitoramento_repo
from app.services.monitoramento_comum import _agora_utc, _compor_observacao

MARCO_PREVISAO = "cronograma_previsao_inauguracao"
MARCO_DISPENSADA = "cronograma_inauguracao_dispensada"


def inauguracao_vigente(db: Session, instrumento_id: int, codigo: str = MARCO_PREVISAO) -> EventoMarco | None:
    marco = monitoramento_repo.obter_marco_por_codigo(db, codigo)
    if marco is None:
        return None
    return monitoramento_repo.obter_evento_mais_recente_do_marco(db, instrumento_id=instrumento_id, marco_id=marco.id)


def registrar_inauguracao_realizada(
    db: Session,
    *,
    instrumento: InstrumentoEquipamento,
    data_ocorrencia: date,
    usuario: User,
    fase_geral_id: int | None,
    observacao: str,
    confirmada_com_conclusao: bool = True,
) -> tuple[EventoMarco, date | None]:
    """Grava a inauguração realizada no lugar da previsão vigente. Devolve o evento e a previsão anterior."""
    marco = monitoramento_repo.obter_marco_por_codigo(db, MARCO_PREVISAO)
    if marco is None:
        raise ValidationError("Marco de previsão de inauguração não encontrado no catálogo.")
    anterior = monitoramento_repo.obter_evento_mais_recente_do_marco(
        db, instrumento_id=instrumento.id, marco_id=marco.id
    )
    if anterior and anterior.data_ocorrencia is not None:
        raise ValidationError("Já existe uma inauguração realizada para este instrumento.")
    previsao_anterior = anterior.data_prevista if anterior else None
    inauguracao = EventoMarco(
        instrumento_id=instrumento.id,
        marco_id=marco.id,
        fase_geral_id=fase_geral_id,
        data_ocorrencia=data_ocorrencia,
        observacao=_compor_observacao(usuario.name, observacao),
        autor_id=usuario.id,
    )
    if anterior is not None:
        anterior.atualizado_em = _agora_utc()
        monitoramento_repo.substituir_evento(db, anterior, inauguracao)
    else:
        monitoramento_repo.adicionar_evento(db, inauguracao)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=inauguracao.id,
        action="created",
        details={
            "nr_convenio": instrumento.nr_convenio,
            "marco_id": marco.id,
            "data_prevista_anterior": previsao_anterior.isoformat() if previsao_anterior else None,
            "data_ocorrencia": data_ocorrencia.isoformat(),
            "confirmada_com_conclusao": confirmada_com_conclusao,
        },
    )
    return inauguracao, previsao_anterior
