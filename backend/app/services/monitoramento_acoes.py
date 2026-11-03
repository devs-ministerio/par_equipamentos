"""Ações de acompanhamento do monitoramento (criar, editar, excluir, concluir)."""

from __future__ import annotations

from datetime import date
from typing import cast

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento
from app.db.models import (
    AcaoMonitoramento,
    InstrumentoEquipamento,
    User,
)
from app.domain_errors import NotFoundError, ValidationError
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.services.monitoramento_comum import _agora_utc, _notificar_edicao_manual


def registrar_acao_monitorada(
    *,
    nr_convenio: str,
    descricao: str,
    data_prevista: date | None,
    responsavel: str | None,
    db: Session,
    usuario: User,
    responsavel_id: int | None = None,
) -> AcaoMonitoramento:
    """Cria uma acao PENDENTE (data_conclusao null) -- diferente de
    EventoMarco, essa tabela nao esta amarrada a um catalogo fixo de
    marcos (ver docstring de AcaoMonitoramento no models.py).
    `criado_por_id` (marcador de responsável pedido no Plan Mode
    monitoramento-evolucao 2026-09-19) vem sempre do usuário autenticado,
    nunca do cliente."""
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))

    acao = AcaoMonitoramento(
        instrumento_id=instrumento.id,
        descricao=descricao,
        data_prevista=data_prevista,
        responsavel=responsavel,
        responsavel_id=responsavel_id,
        criado_por_id=usuario.id,
    )
    monitoramento_repo.adicionar_acao(db, acao)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="acao_monitoramento",
        entity_id=acao.id,
        action="created",
        details={"nr_convenio": nr_convenio, "responsavel": responsavel, "responsavel_id": responsavel_id},
    )
    _notificar_edicao_manual(
        db,
        instrumento_id=instrumento.id,
        titulo=f"{usuario.name} abriu uma ação em {nr_convenio}",
        corpo=descricao,
    )
    db.commit()
    db.refresh(acao)
    return acao


def _resumo_acao(acao: AcaoMonitoramento) -> dict[str, object | None]:
    return {
        "descricao": acao.descricao,
        "data_prevista": acao.data_prevista.isoformat() if acao.data_prevista else None,
        "responsavel": acao.responsavel,
        "responsavel_id": acao.responsavel_id,
        "data_conclusao": acao.data_conclusao.isoformat() if acao.data_conclusao else None,
    }


def editar_acao_monitorada(
    *,
    acao_id: int,
    descricao: str,
    data_prevista: date | None,
    responsavel: str | None,
    responsavel_id: int | None,
    db: Session,
    usuario: User,
) -> AcaoMonitoramento:
    """Mesma disciplina append-only de `editar_evento_monitorado` -- corrige
    lançando uma ação nova e aponta a antiga pra ela via
    `substituido_por_id`. Corrigir texto, prazo ou responsável é correção cadastral e NÃO reabre a ação:
    a `data_conclusao` migra para a versão corrigida (achado D25 do diagnóstico de 29/10/2026; antes a
    correção nascia pendente e reabria a tarefa em silêncio). Concluir segue sendo ato separado, ver
    `concluir_acao_monitorada`."""
    antiga = monitoramento_repo.obter_acao_por_id(db, acao_id)
    if antiga is None:
        raise NotFoundError(f"Ação {acao_id} não encontrada.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, antiga.instrumento_id))
    if antiga.deletado_em is not None or antiga.substituido_por_id is not None:
        raise ValidationError(f"Ação {acao_id} já foi excluída ou corrigida -- não pode editar de novo.")
    # instrumento_id de uma ação já persistida é FK obrigatória -- sempre existe.
    instrumento = cast(InstrumentoEquipamento, monitoramento_repo.obter_instrumento_por_id(db, antiga.instrumento_id))

    nova = AcaoMonitoramento(
        instrumento_id=antiga.instrumento_id,
        descricao=descricao,
        data_prevista=data_prevista,
        data_conclusao=antiga.data_conclusao,
        responsavel=responsavel,
        responsavel_id=responsavel_id,
        criado_por_id=usuario.id,
    )
    monitoramento_repo.adicionar_acao(db, nova)
    antiga.substituido_por_id = nova.id
    antiga.atualizado_em = _agora_utc()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="acao_monitoramento",
        entity_id=nova.id,
        action="updated",
        details={"acao_original_id": acao_id, "old": _resumo_acao(antiga), "new": _resumo_acao(nova)},
    )
    _notificar_edicao_manual(
        db,
        instrumento_id=instrumento.id,
        titulo=f"{usuario.name} corrigiu uma ação em {instrumento.nr_convenio}",
        corpo=descricao,
    )
    db.commit()
    db.refresh(nova)
    return nova


def excluir_acao_monitorada(*, acao_id: int, motivo: str, db: Session, usuario: User) -> AcaoMonitoramento:
    """Exclusão lógica -- ver docstring de `excluir_evento_monitorado`,
    mesma disciplina."""
    acao = monitoramento_repo.obter_acao_por_id(db, acao_id)
    if acao is None:
        raise NotFoundError(f"Ação {acao_id} não encontrada.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, acao.instrumento_id))
    if acao.deletado_em is not None:
        raise ValidationError(f"Ação {acao_id} já está excluída.")
    if not motivo.strip():
        raise ValidationError("Informe o motivo da exclusão.")
    # instrumento_id de uma ação já persistida é FK obrigatória -- sempre existe.
    instrumento = cast(InstrumentoEquipamento, monitoramento_repo.obter_instrumento_por_id(db, acao.instrumento_id))

    acao.deletado_em = _agora_utc()
    acao.deletado_por_id = usuario.id
    acao.motivo_exclusao = motivo
    log_action(
        db,
        user_id=usuario.id,
        entity_name="acao_monitoramento",
        entity_id=acao.id,
        action="deleted",
        details={"motivo": motivo},
    )
    _notificar_edicao_manual(
        db,
        instrumento_id=instrumento.id,
        titulo=f"{usuario.name} excluiu uma ação em {instrumento.nr_convenio}",
        corpo=f"{acao.descricao}. Motivo: {motivo}",
    )
    db.commit()
    db.refresh(acao)
    return acao


def concluir_acao_monitorada(*, acao_id: int, db: Session, usuario: User) -> AcaoMonitoramento:
    """Unico UPDATE que AcaoMonitoramento permite de proposito -- marcar
    como concluida (seta data_conclusao = hoje). Descricao/data_prevista/
    responsavel continuam imutaveis (ver docstring do model)."""
    acao = monitoramento_repo.obter_acao_por_id(db, acao_id)
    if acao is None:
        raise NotFoundError(f"Ação {acao_id} não encontrada.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, acao.instrumento_id))
    if acao.deletado_em is not None or acao.substituido_por_id is not None:
        raise ValidationError(f"Ação {acao_id} já foi excluída ou corrigida -- não pode concluir.")
    if acao.data_conclusao is None:
        acao.data_conclusao = date.today()
        log_action(
            db,
            user_id=usuario.id,
            entity_name="acao_monitoramento",
            entity_id=acao.id,
            action="completed",
            details={"old": None, "new": acao.data_conclusao.isoformat()},
        )
        # instrumento_id de uma ação já persistida é FK obrigatória -- sempre existe.
        instrumento = cast(InstrumentoEquipamento, monitoramento_repo.obter_instrumento_por_id(db, acao.instrumento_id))
        _notificar_edicao_manual(
            db,
            instrumento_id=instrumento.id,
            titulo=f"{usuario.name} concluiu uma ação em {instrumento.nr_convenio}",
            corpo=acao.descricao,
        )
    db.commit()
    db.refresh(acao)
    return acao


def obter_nr_convenio_da_acao_monitorada(*, acao: AcaoMonitoramento, db: Session) -> str:
    """Resolve o instrumento pai para a resposta HTTP sem expor query ao router."""
    instrumento = monitoramento_repo.obter_instrumento_por_id(db, acao.instrumento_id)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {acao.instrumento_id} não encontrado.")
    return instrumento.nr_convenio


def listar_acoes_monitoradas(*, pendentes: bool, limit: int, db: Session) -> list[tuple[AcaoMonitoramento, str]]:
    """Leitura operacional: filtro e query permanecem fora da camada HTTP."""
    return monitoramento_repo.listar_acoes_monitoradas(db, pendentes=pendentes, limit=limit)
