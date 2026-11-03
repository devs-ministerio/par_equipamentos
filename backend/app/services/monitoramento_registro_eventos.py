"""Registro, edição e exclusão de eventos (marcos) do monitoramento."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import cast

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento
from app.db.models import (
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
    MarcoGrupo,
    User,
)
from app.domain_errors import ConflictError, NotFoundError, ValidationError
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.services.monitoramento_cadastro import DadosEquipamentoEntregue, _resumo_equipamento_entregue
from app.services.monitoramento_comum import _agora_utc, _compor_observacao, _notificar_edicao_manual


@dataclass(frozen=True)
class NovoEventoMonitorado:
    marco_id: int
    data_ocorrencia: date | None = None
    data_prevista: date | None = None
    status_regulatorio: str | None = None
    numero_documento: str | None = None
    data_validade: date | None = None
    observacao: str | None = None
    equipamento: DadosEquipamentoEntregue = DadosEquipamentoEntregue()
    # Obrigatório quando `marco.grupo != fase_geral` (Plan Mode
    # monitoramento-evolucao 2026-09-19) -- amarra o marco de cronograma
    # físico/regulatório à fase geral que ele pertence. Ignorado quando o
    # próprio marco JÁ é de grupo=fase_geral.
    fase_geral_id: int | None = None
    confirmar_inauguracao: bool = False


def _validar_fase_geral_id(db: Session, marco: MarcoCatalogo, fase_geral_id: int | None) -> int | None:
    if marco.grupo == MarcoGrupo.fase_geral:
        return None
    if fase_geral_id is None:
        raise ValidationError("Indique a fase geral correspondente a este marco de cronograma físico/regulatório.")
    fase = monitoramento_repo.obter_marco_por_id(db, fase_geral_id)
    if fase is None or fase.grupo != MarcoGrupo.fase_geral:
        raise ValidationError(f"fase_geral_id {fase_geral_id} não corresponde a um marco de fase geral válido.")
    return fase_geral_id


def _validar_dados_novo_evento(marco: MarcoCatalogo, dados: NovoEventoMonitorado) -> None:
    if marco.grupo == MarcoGrupo.fase_geral and dados.data_prevista is not None:
        raise ValidationError("Marco de fase geral não aceita data prevista; informe somente a data de ocorrência.")
    if dados.data_ocorrencia and dados.data_ocorrencia > date.today():
        raise ValidationError("A data realizada não pode estar no futuro. Atualize-a para a data real da ocorrência.")
    if marco.codigo != "fase_concluido":
        return
    if dados.data_ocorrencia is None:
        raise ValidationError("Informe a data de ocorrência para concluir o instrumento.")
    if not dados.confirmar_inauguracao:
        raise ValidationError("Confirme a inauguração na data de conclusão antes de registrar o evento.")


def _aplicar_dados_equipamento_entregue(
    instrumento: InstrumentoEquipamento, marco: MarcoCatalogo, dados: NovoEventoMonitorado
) -> str | None:
    observacao = dados.observacao
    if marco.codigo != "cronograma_entrega":
        return observacao
    equipamento = dados.equipamento
    if equipamento.marca is not None:
        instrumento.equipamento_marca = equipamento.marca
    if equipamento.modelo is not None:
        instrumento.equipamento_modelo = equipamento.modelo
    if equipamento.numero_serie is not None:
        instrumento.equipamento_numero_serie = equipamento.numero_serie
    if equipamento.vida_util_anos is not None:
        instrumento.equipamento_vida_util_anos = equipamento.vida_util_anos
    resumo = _resumo_equipamento_entregue(equipamento)
    return f"{observacao}. {resumo}" if observacao and resumo else resumo or observacao


def _registrar_inauguracao_confirmada(
    *,
    db: Session,
    instrumento: InstrumentoEquipamento,
    marco: MarcoCatalogo,
    dados: NovoEventoMonitorado,
    usuario: User,
    nr_convenio: str,
) -> tuple[int | None, date | None]:
    if marco.codigo != "fase_concluido":
        return None, None
    marco_inauguracao = monitoramento_repo.obter_marco_por_codigo(db, "cronograma_previsao_inauguracao")
    if marco_inauguracao is None:
        raise ValidationError("Marco de previsão de inauguração não encontrado no catálogo.")
    anterior = monitoramento_repo.obter_evento_mais_recente_do_marco(
        db, instrumento_id=instrumento.id, marco_id=marco_inauguracao.id
    )
    if anterior and anterior.data_ocorrencia is not None:
        raise ValidationError("Já existe uma inauguração realizada para este instrumento.")
    previsao_anterior = anterior.data_prevista if anterior else None
    inauguracao = EventoMarco(
        instrumento_id=instrumento.id,
        marco_id=marco_inauguracao.id,
        fase_geral_id=marco.id,
        data_ocorrencia=dados.data_ocorrencia,
        observacao=_compor_observacao(usuario.name, "Inauguração confirmada ao concluir o instrumento."),
        autor_id=usuario.id,
    )
    monitoramento_repo.adicionar_evento(db, inauguracao)
    if anterior is not None:
        anterior.substituido_por_id = inauguracao.id
        anterior.atualizado_em = _agora_utc()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=inauguracao.id,
        action="created",
        details={
            "nr_convenio": nr_convenio,
            "marco_id": marco_inauguracao.id,
            "data_prevista_anterior": previsao_anterior.isoformat() if previsao_anterior else None,
            "data_ocorrencia": dados.data_ocorrencia.isoformat() if dados.data_ocorrencia else None,
            "confirmada_com_conclusao": True,
        },
    )
    return inauguracao.id, previsao_anterior


def registrar_evento_monitorado(
    *,
    nr_convenio: str,
    dados: NovoEventoMonitorado,
    db: Session,
    usuario: User,
) -> EventoMarco:
    """Append-only -- sempre INSERT, nunca UPDATE (ver comentario em
    EventoMarco no models.py). Corrigir um lançamento errado é lançar um
    evento novo (ver `editar_evento_monitorado`)."""
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    marco = monitoramento_repo.obter_marco_por_id(db, dados.marco_id)
    if marco is None:
        raise ValidationError(f"Marco {dados.marco_id} não existe no catálogo.")
    fase_geral_id = _validar_fase_geral_id(db, marco, dados.fase_geral_id)

    _validar_dados_novo_evento(marco, dados)

    evento_anterior = monitoramento_repo.obter_evento_mais_recente_do_marco(
        db, instrumento_id=instrumento.id, marco_id=dados.marco_id
    )
    if marco.grupo == MarcoGrupo.fase_geral and evento_anterior is not None:
        raise ConflictError(
            f'A fase "{marco.rotulo}" já está registrada para {nr_convenio}. Edite o lançamento existente.'
        )
    reprogramou = bool(
        dados.data_prevista
        and evento_anterior
        and evento_anterior.data_prevista
        and dados.data_prevista != evento_anterior.data_prevista
    )
    if reprogramou and not (dados.observacao or "").strip():
        raise ValidationError("Informe a justificativa para alterar a data prevista.")

    observacao = _aplicar_dados_equipamento_entregue(instrumento, marco, dados)

    evento = EventoMarco(
        instrumento_id=instrumento.id,
        marco_id=dados.marco_id,
        fase_geral_id=fase_geral_id,
        data_ocorrencia=dados.data_ocorrencia,
        data_prevista=dados.data_prevista,
        status_regulatorio=dados.status_regulatorio,
        numero_documento=dados.numero_documento,
        data_validade=dados.data_validade,
        observacao=_compor_observacao(usuario.name, observacao),
        autor_id=usuario.id,
    )
    monitoramento_repo.adicionar_evento(db, evento)
    inauguracao_id, _ = _registrar_inauguracao_confirmada(
        db=db, instrumento=instrumento, marco=marco, dados=dados, usuario=usuario, nr_convenio=nr_convenio
    )
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=evento.id,
        action="created",
        details={
            "nr_convenio": nr_convenio,
            "marco_id": dados.marco_id,
            "data_prevista_anterior": evento_anterior.data_prevista.isoformat()
            if reprogramou and evento_anterior and evento_anterior.data_prevista
            else None,
            "data_prevista_nova": dados.data_prevista.isoformat() if dados.data_prevista else None,
            "data_ocorrencia": dados.data_ocorrencia.isoformat() if dados.data_ocorrencia else None,
            "reprogramacao": reprogramou,
            "inauguracao_confirmada": inauguracao_id is not None,
            "evento_inauguracao_id": inauguracao_id,
        },
    )
    _notificar_edicao_manual(
        db,
        instrumento_id=instrumento.id,
        titulo=f"{usuario.name} registrou evento em {nr_convenio}",
        corpo=f"Marco: {marco.rotulo}",
    )
    db.commit()
    db.refresh(evento)
    return evento


def _resumo_evento(evento: EventoMarco) -> dict[str, object | None]:
    return {
        "data_ocorrencia": evento.data_ocorrencia.isoformat() if evento.data_ocorrencia else None,
        "data_prevista": evento.data_prevista.isoformat() if evento.data_prevista else None,
        "status_regulatorio": evento.status_regulatorio,
        "numero_documento": evento.numero_documento,
        "data_validade": evento.data_validade.isoformat() if evento.data_validade else None,
        "observacao": evento.observacao,
    }


def editar_evento_monitorado(
    *,
    evento_id: int,
    dados: NovoEventoMonitorado,
    db: Session,
    usuario: User,
) -> EventoMarco:
    """ "Editar" continua append-only (decisão do usuário, Plan Mode
    monitoramento-evolucao 2026-09-19): lança um evento novo corrigido e
    aponta o antigo pra ele via `substituido_por_id` -- nunca UPDATE nos
    campos do lançamento original. Marco/instrumento do evento não mudam
    numa correção (isso seria excluir + criar de novo, não "editar")."""
    antigo = monitoramento_repo.obter_evento_por_id(db, evento_id)
    if antigo is None:
        raise NotFoundError(f"Evento {evento_id} não encontrado.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, antigo.instrumento_id))
    if antigo.deletado_em is not None or antigo.substituido_por_id is not None:
        raise ValidationError(f"Evento {evento_id} já foi excluído ou corrigido -- não pode editar de novo.")

    marco = monitoramento_repo.obter_marco_por_id(db, antigo.marco_id)
    if marco is None:
        raise NotFoundError(f"Marco {antigo.marco_id} não existe mais no catálogo.")
    # instrumento_id de um evento já persistido é FK obrigatória -- sempre existe.
    instrumento = cast(InstrumentoEquipamento, monitoramento_repo.obter_instrumento_por_id(db, antigo.instrumento_id))
    fase_geral_id = _validar_fase_geral_id(db, marco, dados.fase_geral_id)
    if marco.grupo == MarcoGrupo.fase_geral and dados.data_prevista is not None:
        raise ValidationError("Marco de fase geral não aceita data prevista; informe somente a data de ocorrência.")
    if dados.data_ocorrencia and dados.data_ocorrencia > date.today():
        raise ValidationError("A data realizada não pode estar no futuro.")

    novo = EventoMarco(
        instrumento_id=antigo.instrumento_id,
        marco_id=antigo.marco_id,
        fase_geral_id=fase_geral_id,
        data_ocorrencia=dados.data_ocorrencia,
        data_prevista=dados.data_prevista,
        status_regulatorio=dados.status_regulatorio,
        numero_documento=dados.numero_documento,
        data_validade=dados.data_validade,
        observacao=_compor_observacao(usuario.name, dados.observacao),
        autor_id=usuario.id,
    )
    monitoramento_repo.substituir_evento(db, antigo, novo)
    antigo.atualizado_em = _agora_utc()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=novo.id,
        action="updated",
        details={"evento_original_id": evento_id, "old": _resumo_evento(antigo), "new": _resumo_evento(novo)},
    )
    _notificar_edicao_manual(
        db,
        instrumento_id=instrumento.id,
        titulo=f"{usuario.name} corrigiu um evento em {instrumento.nr_convenio}",
        corpo=f"Marco: {marco.rotulo}",
    )
    db.commit()
    db.refresh(novo)
    return novo


def excluir_evento_monitorado(*, evento_id: int, motivo: str, db: Session, usuario: User) -> EventoMarco:
    """Exclusão lógica -- `deletado_em`/`deletado_por_id`/`motivo_exclusao`,
    nunca DELETE físico (ver docstring de EventoMarco). Evento excluído sai
    do cálculo de fase/timeline mas continua recuperável/auditável."""
    evento = monitoramento_repo.obter_evento_por_id(db, evento_id)
    if evento is None:
        raise NotFoundError(f"Evento {evento_id} não encontrado.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, evento.instrumento_id))
    if evento.deletado_em is not None:
        raise ValidationError(f"Evento {evento_id} já está excluído.")
    if not motivo.strip():
        raise ValidationError("Informe o motivo da exclusão.")

    # marco_id/instrumento_id de um evento já persistido são FK obrigatórias -- sempre existem.
    marco = cast(MarcoCatalogo, monitoramento_repo.obter_marco_por_id(db, evento.marco_id))
    instrumento = cast(InstrumentoEquipamento, monitoramento_repo.obter_instrumento_por_id(db, evento.instrumento_id))
    evento.deletado_em = _agora_utc()
    evento.deletado_por_id = usuario.id
    evento.motivo_exclusao = motivo
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=evento.id,
        action="deleted",
        details={"motivo": motivo},
    )
    _notificar_edicao_manual(
        db,
        instrumento_id=instrumento.id,
        titulo=f"{usuario.name} excluiu um evento em {instrumento.nr_convenio}",
        corpo=f"Marco: {marco.rotulo}. Motivo: {motivo}",
    )
    # O chamador pode recalcular a fase ainda nesta mesma transação. Garante
    # que a exclusão lógica já participe das queries seguintes, sem depender
    # de um autoflush implícito do SQLAlchemy.
    monitoramento_repo.sincronizar(db)
    db.commit()
    db.refresh(evento)
    return evento
