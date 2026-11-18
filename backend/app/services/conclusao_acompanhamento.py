"""Conclusão do acompanhamento: resultado calculado, impedimentos e reabertura.

Só os itens controlados por unidade entram no cálculo e bloqueiam a conclusão; nos instrumentos de exceção, os
demais itens de aquisição não bloqueiam. O resultado é calculado pelo sistema e confirmado pela equipe. Ação
aberta, entrega antiga a vincular e item na fila de revisão impedem concluir. Depois de concluído, as entregas e
os cancelamentos ficam bloqueados até a reabertura (`assert_nao_concluido`).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento, usuario_pode_editar_instrumento
from app.db.models import ConclusaoInstrumento, InstrumentoEquipamento, User
from app.domain_errors import ConflictError, NotFoundError, ValidationError
from app.repositories import conclusoes as repo
from app.repositories import itens_equipamento as itens_repo
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.schemas_conclusao import (
    AvaliacaoConclusaoRead,
    ConclusaoCreate,
    ConclusaoRead,
    ImpedimentoRead,
    ReaberturaCreate,
    ResultadoConclusao,
)


@dataclass(frozen=True)
class ItemParaConclusao:
    """Quantidades de um item controlado; `planejado` nulo é quantidade desconhecida."""

    planejado: int | None
    entregue: int
    cancelado: int


def _item_completo(item: ItemParaConclusao) -> bool:
    if item.planejado is None:
        return False  # sem quantidade planejada não há como provar que tudo foi entregue
    return item.entregue >= item.planejado - item.cancelado


def calcular_resultado(itens: list[ItemParaConclusao]) -> ResultadoConclusao:
    """sem_entregas: nada entregue (ou sem item controlado); integral: todo item completo; senão parcial."""
    if sum(i.entregue for i in itens) == 0:
        return "sem_entregas"
    return "integral" if all(_item_completo(i) for i in itens) else "parcial"


def _ler(conclusao: ConclusaoInstrumento) -> ConclusaoRead:
    return ConclusaoRead(
        id=conclusao.id,
        resultado=conclusao.resultado,  # type: ignore[arg-type]
        data_conclusao=conclusao.data_conclusao,
        justificativa=conclusao.justificativa,
        data_inauguracao=conclusao.data_inauguracao,
    )


def _instrumento_ou_404(db: Session, nr_convenio: str) -> InstrumentoEquipamento:
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    return instrumento


def assert_nao_concluido(db: Session, instrumento_id: int) -> None:
    if repo.existe_ativa(db, instrumento_id):
        raise ConflictError("O acompanhamento está concluído. Reabra-o para alterar entregas ou cancelamentos.")


def _itens_controlados(db: Session, instrumento_id: int) -> list[ItemParaConclusao]:
    itens = [item for item, _, _ in itens_repo.listar_itens_do_instrumento(db, instrumento_id) if item.controla_unidade]
    ids = [item.id for item in itens]
    entregues = itens_repo.quantidades_entregues_por_item(db, ids)
    canceladas = itens_repo.quantidades_canceladas_por_item(db, ids)
    return [ItemParaConclusao(i.quantidade_planejada, entregues.get(i.id, 0), canceladas.get(i.id, 0)) for i in itens]


def _impedimentos(db: Session, instrumento_id: int) -> list[ImpedimentoRead]:
    impedimentos: list[ImpedimentoRead] = []
    revisoes = itens_repo.contar_revisoes_pendentes(db, instrumento_id)
    if revisoes:
        impedimentos.append(
            ImpedimentoRead(tipo="entrega_legada", descricao=f"{revisoes} entrega(s) antiga(s) a vincular aos itens.")
        )
    itens_em_revisao = repo.contar_itens_em_revisao(db, instrumento_id)
    if itens_em_revisao:
        impedimentos.append(
            ImpedimentoRead(tipo="item_em_revisao", descricao=f"{itens_em_revisao} item(ns) na fila de revisão.")
        )
    for acao in repo.listar_acoes_abertas(db, instrumento_id):
        impedimentos.append(ImpedimentoRead(tipo="acao_aberta", descricao=f"Ação aberta: {acao.descricao[:120]}"))
    return impedimentos


def avaliar_conclusao(*, nr_convenio: str, db: Session, usuario: User) -> AvaliacaoConclusaoRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    itens = _itens_controlados(db, instrumento.id)
    resultado = calcular_resultado(itens)
    ativa = repo.obter_ativa(db, instrumento.id)
    return AvaliacaoConclusaoRead(
        nr_convenio=nr_convenio,
        pode_editar=usuario_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id)),
        conclusao=_ler(ativa) if ativa else None,
        resultado=resultado,
        exige_justificativa=resultado != "integral",
        itens_exigidos=len(itens),
        itens_completos=sum(1 for i in itens if _item_completo(i)),
        impedimentos=_impedimentos(db, instrumento.id),
    )


def concluir_acompanhamento(*, nr_convenio: str, dados: ConclusaoCreate, db: Session, usuario: User) -> ConclusaoRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    if repo.existe_ativa(db, instrumento.id):
        raise ConflictError("O acompanhamento já está concluído.")
    impedimentos = _impedimentos(db, instrumento.id)
    if impedimentos:
        raise ValidationError("Há pendências que impedem a conclusão: " + " ".join(i.descricao for i in impedimentos))
    resultado = calcular_resultado(_itens_controlados(db, instrumento.id))
    if dados.resultado_confirmado != resultado:
        raise ConflictError("O resultado das entregas mudou. Recarregue a conclusão e confirme de novo.")
    if dados.data_conclusao > date.today():
        raise ValidationError("A data de conclusão não pode estar no futuro.")
    justificativa = (dados.justificativa or "").strip() or None
    if resultado != "integral" and justificativa is None:
        raise ValidationError("Informe a justificativa: a conclusão não é integral.")
    conclusao = ConclusaoInstrumento(
        instrumento_id=instrumento.id,
        resultado=resultado,
        data_conclusao=dados.data_conclusao,
        justificativa=justificativa,
        data_inauguracao=dados.data_inauguracao,
        autor_id=usuario.id,
    )
    repo.adicionar(db, conclusao)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="conclusao_instrumento",
        entity_id=conclusao.id,
        action="created",
        details={
            "nr_convenio": nr_convenio,
            "resultado": resultado,
            "data_conclusao": dados.data_conclusao.isoformat(),
        },
    )
    db.commit()
    return _ler(conclusao)


def reabrir_acompanhamento(*, nr_convenio: str, dados: ReaberturaCreate, db: Session, usuario: User) -> ConclusaoRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    conclusao = repo.obter_ativa(db, instrumento.id)
    if conclusao is None:
        raise NotFoundError("O acompanhamento não está concluído.")
    conclusao.deletado_em = datetime.now(timezone.utc)
    conclusao.deletado_por_id = usuario.id
    conclusao.motivo_exclusao = dados.motivo.strip()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="conclusao_instrumento",
        entity_id=conclusao.id,
        action="deleted",
        details={"nr_convenio": nr_convenio, "motivo": dados.motivo.strip()},
    )
    db.commit()
    return _ler(conclusao)
