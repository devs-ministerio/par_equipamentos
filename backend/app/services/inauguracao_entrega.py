"""Resposta à pergunta "o equipamento precisa de inauguração?" feita ao registrar a entrega.

Sim: a previsão vigente é confirmada ou substituída (append-only). Não: registra "Inauguração dispensada".
Inauguração já realizada não é alterada. Sem commit aqui: roda na transação da entrega."""

from __future__ import annotations

from app.audit import log_action
from app.db.models import EventoMarco, InstrumentoEquipamento, User
from app.domain_errors import ValidationError
from app.repositories import monitoramento as monitoramento_repo
from app.schemas_entregas import InauguracaoEntrega

MARCO_PREVISAO = "cronograma_previsao_inauguracao"
MARCO_DISPENSADA = "cronograma_inauguracao_dispensada"


def registrar_resposta_inauguracao(
    db, instrumento: InstrumentoEquipamento, resposta: InauguracaoEntrega, usuario: User
) -> None:
    previsao = monitoramento_repo.obter_marco_por_codigo(db, MARCO_PREVISAO)
    dispensada = monitoramento_repo.obter_marco_por_codigo(db, MARCO_DISPENSADA)
    if previsao is None or dispensada is None:
        raise ValidationError("Marcos de inauguração não encontrados no catálogo.")
    vigente_previsao = monitoramento_repo.obter_evento_mais_recente_do_marco(
        db, instrumento_id=instrumento.id, marco_id=previsao.id
    )
    vigente_dispensada = monitoramento_repo.obter_evento_mais_recente_do_marco(
        db, instrumento_id=instrumento.id, marco_id=dispensada.id
    )
    if vigente_previsao is not None and vigente_previsao.data_ocorrencia is not None:
        return  # já inaugurado: a resposta não altera o que aconteceu
    if resposta.necessaria:
        if resposta.data_prevista is None:
            raise ValidationError("Informe a previsão de inauguração.")
        if vigente_previsao is not None and vigente_previsao.data_prevista == resposta.data_prevista:
            if vigente_dispensada is not None:
                _substituir(vigente_dispensada, vigente_previsao)
        else:
            novo = _novo_evento(instrumento, previsao.id, usuario, data_prevista=resposta.data_prevista)
            _gravar(db, novo, vigente_previsao or vigente_dispensada)
    elif vigente_dispensada is None:
        novo = _novo_evento(instrumento, dispensada.id, usuario, observacao="Dispensada na entrega")
        _gravar(db, novo, vigente_previsao)
    elif vigente_previsao is not None:
        _substituir(vigente_previsao, vigente_dispensada)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="instrumento_equipamento",
        entity_id=instrumento.id,
        action="inauguracao_respondida",
        details={
            "nr_convenio": instrumento.nr_convenio,
            "necessaria": resposta.necessaria,
            "data_prevista": resposta.data_prevista.isoformat() if resposta.data_prevista else None,
        },
    )


def _novo_evento(instrumento, marco_id: int, usuario: User, **campos) -> EventoMarco:
    return EventoMarco(instrumento_id=instrumento.id, marco_id=marco_id, autor_id=usuario.id, **campos)


def _gravar(db, novo: EventoMarco, antigo: EventoMarco | None) -> None:
    """Há no máximo uma inauguração ativa por instrumento (índice único): o antigo sai antes de o novo entrar."""
    if antigo is None:
        monitoramento_repo.adicionar_evento(db, novo)
    else:
        monitoramento_repo.substituir_evento(db, antigo, novo)


def _substituir(antigo: EventoMarco | None, novo: EventoMarco | None) -> None:
    if antigo is not None and novo is not None and antigo is not novo:
        antigo.substituido_por_id = novo.id
