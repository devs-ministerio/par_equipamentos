"""Documentos do instrumento (NF, OS, TRP, TRD, SCRA e licença de operação da ANSN).

Independentes da fase. Append-only: corrigir cria linha nova e aponta a antiga; excluir é soft delete com motivo.
Autorização por titularidade do instrumento e `AuditLog` em toda escrita.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento, usuario_pode_editar_instrumento
from app.db.models import DocumentoInstrumento, InstrumentoEquipamento, User
from app.domain_errors import ConflictError, NotFoundError
from app.repositories import documentos as repo
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.schemas_documentos import (
    DocumentoCreate,
    DocumentoExclusao,
    DocumentoRead,
    DocumentosInstrumentoRead,
)
from app.services.conclusao_acompanhamento import assert_nao_concluido


def _ler(documento: DocumentoInstrumento) -> DocumentoRead:
    return DocumentoRead(
        id=documento.id,
        tipo=documento.tipo,  # type: ignore[arg-type]
        numero=documento.numero,
        data_documento=documento.data_documento,
        status=documento.status,
        data_validade=documento.data_validade,
        observacao=documento.observacao,
    )


def _instrumento_ou_404(db: Session, nr_convenio: str) -> InstrumentoEquipamento:
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    return instrumento


def _ativo_ou_erro(db: Session, documento_id: int) -> DocumentoInstrumento:
    documento = repo.obter(db, documento_id)
    if documento is None:
        raise NotFoundError("Documento não encontrado.")
    if documento.deletado_em is not None or documento.substituido_por_id is not None:
        raise ConflictError("Este documento já foi corrigido ou excluído.")
    return documento


def _novo(instrumento_id: int, dados: DocumentoCreate, usuario: User) -> DocumentoInstrumento:
    return DocumentoInstrumento(
        instrumento_id=instrumento_id,
        tipo=dados.tipo,
        numero=(dados.numero or "").strip() or None,
        data_documento=dados.data_documento,
        status=dados.status,
        data_validade=dados.data_validade,
        observacao=(dados.observacao or "").strip() or None,
        autor_id=usuario.id,
    )


def listar_documentos(*, nr_convenio: str, db: Session, usuario: User) -> DocumentosInstrumentoRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    return DocumentosInstrumentoRead(
        nr_convenio=nr_convenio,
        pode_editar=usuario_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id)),
        documentos=[_ler(d) for d in repo.listar_ativos(db, instrumento.id)],
    )


def registrar_documento(*, nr_convenio: str, dados: DocumentoCreate, db: Session, usuario: User) -> DocumentoRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    assert_nao_concluido(db, instrumento.id)
    documento = _novo(instrumento.id, dados, usuario)
    repo.adicionar(db, documento)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="documento_instrumento",
        entity_id=documento.id,
        action="created",
        details={"nr_convenio": nr_convenio, "tipo": dados.tipo, "numero": documento.numero},
    )
    db.commit()
    return _ler(documento)


def corrigir_documento(*, documento_id: int, dados: DocumentoCreate, db: Session, usuario: User) -> DocumentoRead:
    antigo = _ativo_ou_erro(db, documento_id)
    instrumento = db.get(InstrumentoEquipamento, antigo.instrumento_id)
    if instrumento is None:
        raise NotFoundError("Documento não encontrado.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    assert_nao_concluido(db, instrumento.id)
    novo = _novo(instrumento.id, dados, usuario)
    repo.adicionar(db, novo)
    antigo.substituido_por_id = novo.id
    log_action(
        db,
        user_id=usuario.id,
        entity_name="documento_instrumento",
        entity_id=novo.id,
        action="updated",
        details={"nr_convenio": instrumento.nr_convenio, "substitui": antigo.id, "tipo": dados.tipo},
    )
    db.commit()
    return _ler(novo)


def excluir_documento(*, documento_id: int, dados: DocumentoExclusao, db: Session, usuario: User) -> DocumentoRead:
    documento = _ativo_ou_erro(db, documento_id)
    instrumento = db.get(InstrumentoEquipamento, documento.instrumento_id)
    if instrumento is None:
        raise NotFoundError("Documento não encontrado.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    assert_nao_concluido(db, instrumento.id)
    documento.deletado_em = datetime.now(timezone.utc)
    documento.deletado_por_id = usuario.id
    documento.motivo_exclusao = dados.motivo.strip()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="documento_instrumento",
        entity_id=documento.id,
        action="deleted",
        details={"nr_convenio": instrumento.nr_convenio, "tipo": documento.tipo, "motivo": dados.motivo.strip()},
    )
    db.commit()
    return _ler(documento)
