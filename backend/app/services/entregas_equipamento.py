"""Casos de uso de item planejado, entrega e unidade de equipamento.

Regras (decisões do usuário de 23/10): a unidade nasce na entrega; toda entrega vincula pelo menos um item
controlado (pode ser mais de um); entrega acima do planejado é bloqueada; número de série é opcional e único dentro
do item. Autorização por titularidade do instrumento, sempre dentro do Service. Entrega e unidade seguem o padrão
append-only do projeto: correção de unidade fica no AuditLog (antes/depois) e exclusão é soft delete com motivo.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento, usuario_pode_editar_instrumento
from app.db.models import (
    EntregaEquipamento,
    EventoMarco,
    InstrumentoEquipamento,
    ItemPlano,
    Notificacao,
    NotificacaoTipo,
    UnidadeEquipamento,
    User,
    UserRole,
)
from app.domain_errors import ConflictError, NotFoundError, ValidationError
from app.repositories import itens_equipamento as repo
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.schemas_entregas import (
    EntregaCreate,
    EntregaLegadaRead,
    EntregaRead,
    EquipamentosInstrumentoRead,
    ItemEntregaCreate,
    ItemEquipamentoRead,
    SituacaoItem,
    UnidadeRead,
    UnidadeUpdate,
)

MARCO_ENTREGA = "cronograma_entrega"
MARCO_FASE_ENTREGUE = "fase_equipamento_entregue"


@dataclass
class _ItemValidado:
    item: ItemPlano
    dados: ItemEntregaCreate
    series: list[str]


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _unidade_read(unidade: UnidadeEquipamento, data: date) -> UnidadeRead:
    return UnidadeRead(
        id=unidade.id,
        entrega_id=unidade.entrega_id,
        item_id=unidade.item_id,
        ordem=unidade.ordem,
        marca=unidade.marca,
        modelo=unidade.modelo,
        numero_serie=unidade.numero_serie,
        vida_util_anos=unidade.vida_util_anos,
        data_entrega=data,
    )


def _entrega_read(db: Session, entrega: EntregaEquipamento) -> EntregaRead:
    return EntregaRead(
        id=entrega.id,
        instrumento_id=entrega.instrumento_id,
        evento_id=entrega.evento_id,
        data_ocorrencia=entrega.data_ocorrencia,
        observacao=entrega.observacao,
        unidades=[_unidade_read(u, entrega.data_ocorrencia) for u in repo.unidades_da_entrega(db, entrega)],
    )


def _instrumento_ou_404(db: Session, nr_convenio: str) -> InstrumentoEquipamento:
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    return instrumento


def _situacao(planejado: int | None, entregue: int, revisao_pendente: bool) -> SituacaoItem:
    if entregue == 0:
        return "legado_a_revisar" if revisao_pendente else "pendente"
    if planejado is not None and entregue >= planejado:
        return "entregue"
    return "parcial"


def listar_equipamentos_do_instrumento(*, nr_convenio: str, db: Session, usuario: User) -> EquipamentosInstrumentoRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    itens = repo.listar_itens_do_instrumento(db, instrumento.id)
    controlados = [(item, familia) for item, familia in itens if item.controla_unidade]
    unidades_por_item: dict[int, list[UnidadeRead]] = {}
    for unidade, data in repo.listar_unidades_ativas(db, [item.id for item, _ in controlados]):
        unidades_por_item.setdefault(unidade.item_id, []).append(_unidade_read(unidade, data))
    revisoes = repo.contar_revisoes_pendentes(db, instrumento.id)
    resultado = []
    for item, familia in controlados:
        unidades = unidades_por_item.get(item.id, [])
        resultado.append(
            ItemEquipamentoRead(
                id=item.id,
                codigo_item=item.codigo_item,
                descricao=item.descricao,
                familia=familia,
                controla_unidade=True,
                quantidade_planejada=item.quantidade_planejada,
                quantidade_entregue=len(unidades),
                situacao=_situacao(item.quantidade_planejada, len(unidades), revisoes > 0),
                ultima_entrega=max((u.data_entrega for u in unidades), default=None),
                unidades=unidades,
            )
        )
    return EquipamentosInstrumentoRead(
        nr_convenio=nr_convenio,
        pode_editar=usuario_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id)),
        itens=resultado,
        outros_itens=len(itens) - len(controlados),
        revisoes_pendentes=revisoes,
    )


def _limpar_series(dados: ItemEntregaCreate) -> list[str]:
    series = [s.strip() for s in dados.series if s and s.strip()]
    if len(series) > dados.quantidade:
        raise ValidationError("Há mais números de série do que a quantidade entregue.")
    if len(set(series)) != len(series):
        raise ValidationError("Número de série repetido na mesma entrega.")
    return series


def _validar_itens(
    db: Session, instrumento: InstrumentoEquipamento, itens: list[ItemEntregaCreate]
) -> list[_ItemValidado]:
    if not itens:
        raise ValidationError("Toda entrega precisa vincular pelo menos um equipamento.")
    ids = [i.item_id for i in itens]
    if len(set(ids)) != len(ids):
        raise ValidationError("O mesmo item aparece mais de uma vez na entrega.")
    travados = repo.travar_itens(db, ids)
    validados = []
    for dados in itens:
        item = travados.get(dados.item_id)
        # Item de outro instrumento é tratado como inexistente (sem vazar que existe).
        if item is None or item.instrumento_id != instrumento.id or not item.ativo:
            raise ValidationError(f"Item {dados.item_id} não pertence a este instrumento.")
        if not item.controla_unidade:
            raise ValidationError(f"O item {dados.item_id} não é controlado por unidade.")
        series = _limpar_series(dados)
        if item.quantidade_planejada is None:
            if not dados.confirmar_quantidade_desconhecida:
                raise ValidationError(f"O item {item.id} não tem quantidade planejada; confirme a quantidade entregue.")
        else:
            falta = item.quantidade_planejada - repo.quantidade_entregue(db, item.id)
            if dados.quantidade > falta:
                raise ValidationError(
                    f"Quantidade acima do planejado para o item {item.id}: faltam {max(falta, 0)} unidade(s)."
                )
        repetidas = repo.series_existentes(db, item.id, series)
        if repetidas:
            raise ConflictError(f"Número de série já registrado neste item: {', '.join(sorted(repetidas))}.")
        validados.append(_ItemValidado(item, dados, series))
    return validados


def _gravar_entrega(
    db: Session,
    *,
    instrumento: InstrumentoEquipamento,
    validados: list[_ItemValidado],
    data: date,
    observacao: str | None,
    chave: str,
    evento_id: int | None,
    usuario: User,
) -> EntregaEquipamento:
    entrega = EntregaEquipamento(
        instrumento_id=instrumento.id,
        evento_id=evento_id,
        data_ocorrencia=data,
        observacao=observacao,
        autor_id=usuario.id,
        chave_idempotencia=chave,
    )
    repo.adicionar(db, entrega)
    for v in validados:
        ordem = repo.proxima_ordem(db, v.item.id)
        for posicao in range(v.dados.quantidade):
            repo.adicionar(
                db,
                UnidadeEquipamento(
                    entrega_id=entrega.id,
                    item_id=v.item.id,
                    ordem=ordem + posicao,
                    marca=v.dados.marca,
                    modelo=v.dados.modelo,
                    numero_serie=v.series[posicao] if posicao < len(v.series) else None,
                    vida_util_anos=v.dados.vida_util_anos,
                ),
            )
    return entrega


def _notificar(db: Session, instrumento: InstrumentoEquipamento, titulo: str, corpo: str) -> None:
    monitoramento_repo.adicionar_notificacao(
        db,
        Notificacao(tipo=NotificacaoTipo.edicao_manual, titulo=titulo, corpo=corpo, entidade_id=instrumento.id),
    )


def _resumo_itens(validados: list[_ItemValidado]) -> list[dict[str, object]]:
    return [{"item_id": v.item.id, "quantidade": v.dados.quantidade, "series": v.series} for v in validados]


def registrar_entrega(*, nr_convenio: str, dados: EntregaCreate, db: Session, usuario: User) -> EntregaRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    existente = repo.obter_entrega_por_chave(db, dados.chave_idempotencia)
    if existente is not None:
        return _reenvio(db, existente, instrumento)
    if dados.data_ocorrencia > date.today():
        raise ValidationError("A data da entrega não pode estar no futuro.")
    validados = _validar_itens(db, instrumento, dados.itens)
    marco = monitoramento_repo.obter_marco_por_codigo(db, MARCO_ENTREGA)
    fase = monitoramento_repo.obter_marco_por_codigo(db, MARCO_FASE_ENTREGUE)
    if marco is None or fase is None:
        raise ValidationError("Marco de entrega não encontrado no catálogo.")
    try:
        evento = EventoMarco(
            instrumento_id=instrumento.id,
            marco_id=marco.id,
            fase_geral_id=fase.id,
            data_ocorrencia=dados.data_ocorrencia,
            observacao=f"[{usuario.name}] {dados.observacao}" if dados.observacao else f"[{usuario.name}]",
            autor_id=usuario.id,
        )
        monitoramento_repo.adicionar_evento(db, evento)
        entrega = _gravar_entrega(
            db,
            instrumento=instrumento,
            validados=validados,
            data=dados.data_ocorrencia,
            observacao=dados.observacao,
            chave=dados.chave_idempotencia,
            evento_id=evento.id,
            usuario=usuario,
        )
        log_action(
            db,
            user_id=usuario.id,
            entity_name="entrega_equipamento",
            entity_id=entrega.id,
            action="created",
            details={"nr_convenio": nr_convenio, "evento_id": evento.id, "itens": _resumo_itens(validados)},
        )
        _notificar(
            db,
            instrumento,
            f"{usuario.name} registrou entrega em {nr_convenio}",
            f"{sum(v.dados.quantidade for v in validados)} unidade(s) em {len(validados)} item(ns).",
        )
        db.commit()
    except IntegrityError:
        # Reenvio concorrente com a mesma chave: vale o que foi gravado primeiro.
        db.rollback()
        existente = repo.obter_entrega_por_chave(db, dados.chave_idempotencia)
        if existente is None:
            raise ConflictError("Conflito ao registrar a entrega; recarregue e tente de novo.") from None
        return _reenvio(db, existente, instrumento)
    return _entrega_read(db, entrega)


def _reenvio(db: Session, existente: EntregaEquipamento, instrumento: InstrumentoEquipamento) -> EntregaRead:
    if existente.instrumento_id != instrumento.id:
        raise ConflictError("Chave de idempotência já usada em outro instrumento.")
    return _entrega_read(db, existente)


def corrigir_unidade(*, unidade_id: int, dados: UnidadeUpdate, db: Session, usuario: User) -> UnidadeRead:
    unidade = repo.obter_unidade(db, unidade_id)
    entrega = repo.obter_entrega(db, unidade.entrega_id) if unidade else None
    if unidade is None or entrega is None:
        raise NotFoundError(f"Unidade {unidade_id} não encontrada.")
    instrumento = monitoramento_repo.obter_instrumento_por_id(db, entrega.instrumento_id)
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, entrega.instrumento_id))
    if entrega.deletado_em is not None:
        raise ValidationError("A entrega desta unidade foi excluída.")
    campos = {c: getattr(dados, c) for c in dados.model_fields_set}
    if not campos:
        raise ValidationError("Nenhum campo para corrigir.")
    for texto in ("marca", "modelo", "numero_serie"):
        if texto in campos:
            campos[texto] = (campos[texto] or "").strip() or None
    nova_serie = campos.get("numero_serie")
    if nova_serie and nova_serie != unidade.numero_serie and repo.series_existentes(db, unidade.item_id, [nova_serie]):
        raise ConflictError(f"Número de série já registrado neste item: {nova_serie}.")
    antes = {c: getattr(unidade, c) for c in campos}
    for campo, valor in campos.items():
        setattr(unidade, campo, valor)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="unidade_equipamento",
        entity_id=unidade.id,
        action="updated",
        details={"antes": antes, "depois": campos},
    )
    if instrumento is not None:
        _notificar(
            db, instrumento, f"{usuario.name} corrigiu uma unidade em {instrumento.nr_convenio}", "Dados físicos."
        )
    db.commit()
    return _unidade_read(unidade, entrega.data_ocorrencia)


def excluir_entrega(*, entrega_id: int, motivo: str, db: Session, usuario: User) -> EntregaRead:
    entrega = repo.obter_entrega(db, entrega_id)
    if entrega is None:
        raise NotFoundError(f"Entrega {entrega_id} não encontrada.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, entrega.instrumento_id))
    if entrega.deletado_em is not None:
        raise ValidationError(f"Entrega {entrega_id} já está excluída.")
    if not motivo.strip():
        raise ValidationError("Informe o motivo da exclusão.")
    agora = _agora()
    entrega.deletado_em, entrega.deletado_por_id, entrega.motivo_exclusao = agora, usuario.id, motivo
    evento = db.get(EventoMarco, entrega.evento_id) if entrega.evento_id else None
    if evento is not None and evento.deletado_em is None:
        evento.deletado_em, evento.deletado_por_id, evento.motivo_exclusao = agora, usuario.id, motivo
    log_action(
        db,
        user_id=usuario.id,
        entity_name="entrega_equipamento",
        entity_id=entrega.id,
        action="deleted",
        details={"motivo": motivo, "evento_id": entrega.evento_id},
    )
    instrumento = monitoramento_repo.obter_instrumento_por_id(db, entrega.instrumento_id)
    if instrumento is not None:
        _notificar(db, instrumento, f"{usuario.name} excluiu uma entrega em {instrumento.nr_convenio}", motivo)
    monitoramento_repo.sincronizar(db)
    db.commit()
    return _entrega_read(db, entrega)


def listar_entregas_legadas(*, db: Session, usuario: User) -> list[EntregaLegadaRead]:
    if usuario.role == UserRole.leitor:
        return []
    todas = usuario.role in (UserRole.admin, UserRole.gestor)
    return [
        EntregaLegadaRead(
            id=r.id, nr_convenio=nr, evento_id=r.evento_id, data_ocorrencia=data, motivo=r.motivo, criado_em=r.criado_em
        )
        for r, nr, data in repo.listar_revisoes_pendentes(db, usuario_id=None if todas else usuario.id)
    ]


def vincular_entrega_legada(
    *, revisao_id: int, itens: list[ItemEntregaCreate], db: Session, usuario: User
) -> EntregaRead:
    revisao = repo.obter_revisao(db, revisao_id)
    if revisao is None:
        raise NotFoundError(f"Revisão {revisao_id} não encontrada.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, revisao.instrumento_id))
    if revisao.situacao != "pendente":
        raise ConflictError("Esta entrega já foi vinculada.")
    instrumento = monitoramento_repo.obter_instrumento_por_id(db, revisao.instrumento_id)
    evento = db.get(EventoMarco, revisao.evento_id)
    if instrumento is None or evento is None or evento.data_ocorrencia is None:
        raise ValidationError("O evento de entrega desta revisão não está mais disponível.")
    validados = _validar_itens(db, instrumento, itens)
    entrega = _gravar_entrega(
        db,
        instrumento=instrumento,
        validados=validados,
        data=evento.data_ocorrencia,
        observacao=evento.observacao,
        chave=f"legado:{evento.id}",
        evento_id=evento.id,
        usuario=usuario,
    )
    revisao.situacao, revisao.resolvida_em, revisao.resolvida_por_id, revisao.entrega_id = (
        "resolvida",
        _agora(),
        usuario.id,
        entrega.id,
    )
    log_action(
        db,
        user_id=usuario.id,
        entity_name="entrega_legada_revisao",
        entity_id=revisao.id,
        action="resolved",
        details={"entrega_id": entrega.id, "itens": _resumo_itens(validados)},
    )
    db.commit()
    return _entrega_read(db, entrega)
