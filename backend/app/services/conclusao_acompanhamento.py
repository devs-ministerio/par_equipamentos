"""Conclusão do acompanhamento: resultado calculado, impedimentos e reabertura.

Só os itens controlados por unidade entram no cálculo e bloqueiam a conclusão; nos instrumentos de exceção, os
demais itens de aquisição não bloqueiam. O resultado é calculado pelo sistema e confirmado pela equipe. Ação
aberta e item na fila de revisão impedem concluir. Depois de concluído, as entregas e
os cancelamentos ficam bloqueados até a reabertura (`assert_nao_concluido`).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento, usuario_pode_editar_instrumento
from app.db.models import ConclusaoInstrumento, EventoMarco, InstrumentoEquipamento, User
from app.domain_errors import ConflictError, NotFoundError, ValidationError
from app.equipamentos import nome_curto_do_item
from app.repositories import conclusoes as repo
from app.repositories import itens_equipamento as itens_repo
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.schemas_conclusao import (
    AvaliacaoConclusaoRead,
    ConclusaoCreate,
    ConclusaoRead,
    ImpedimentoRead,
    InauguracaoConclusaoRead,
    ReaberturaCreate,
    ResultadoConclusao,
)
from app.services.inauguracao_realizada import MARCO_DISPENSADA, inauguracao_vigente, registrar_inauguracao_realizada


@dataclass(frozen=True)
class ItemParaConclusao:
    """Quantidades de um item controlado; `planejado` nulo é quantidade desconhecida."""

    planejado: int | None
    entregue: int
    cancelado: int
    nome: str = ""


def unidades_pendentes(item: ItemParaConclusao) -> int:
    """Unidades que ainda não foram entregues nem canceladas. Sem quantidade planejada, qualquer entrega
    lançada fecha o item (não há total para cobrar); sem entrega, ele segue pendente."""
    if item.planejado is None:
        return 0 if item.entregue > 0 else 1
    return max(item.planejado - item.cancelado - item.entregue, 0)


def calcular_resultado(itens: list[ItemParaConclusao]) -> ResultadoConclusao:
    """Só se conclui com todo item entregue ou cancelado.

    sem_entregas: nada foi entregue (tudo cancelado); parcial: há entrega e há unidade cancelada;
    integral: tudo entregue, nada cancelado."""
    if sum(i.entregue for i in itens) == 0:
        return "sem_entregas"
    return "parcial" if any(i.cancelado > 0 for i in itens) else "integral"


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


def _ler_legado(evento: EventoMarco) -> ConclusaoRead:
    """Conclusão antiga (evento `fase_concluido`) apresentada como conclusão, para a tela oferecer Reabrir."""
    return ConclusaoRead(
        id=evento.id,
        resultado="integral",
        data_conclusao=evento.data_ocorrencia,
        justificativa=None,
        data_inauguracao=None,
    )


def travar_instrumento(db: Session, instrumento_id: int) -> None:
    try:
        repo.bloquear_instrumento(db, instrumento_id)
    except repo.InstrumentoEmUso:
        raise ConflictError("O instrumento está sendo alterado por outra pessoa. Tente de novo em instantes.") from None


def assert_nao_concluido(db: Session, instrumento_id: int) -> None:
    """Concluído = a mesma condição da fase: conclusão confirmada ou o evento antigo `fase_concluido`.

    Trava o instrumento antes de checar: quem grava espera a conclusão terminar (e a vê), e a conclusão
    espera quem grava (e vê a pendência nova)."""
    travar_instrumento(db, instrumento_id)
    if repo.existe_ativa(db, instrumento_id) or repo.eventos_concluido_legado(db, instrumento_id):
        raise ConflictError("O acompanhamento está concluído. Reabra-o para alterar o instrumento.")


def _itens_controlados(db: Session, instrumento_id: int) -> list[ItemParaConclusao]:
    linhas = [
        (item, nome_renem or nome_curto_do_item(item.descricao))
        for item, _, nome_renem in itens_repo.listar_itens_do_instrumento(db, instrumento_id)
        if item.controla_unidade
    ]
    itens = [item for item, _ in linhas]
    nomes = [nome for _, nome in linhas]
    ids = [item.id for item in itens]
    entregues = itens_repo.quantidades_entregues_por_item(db, ids)
    canceladas = itens_repo.quantidades_canceladas_por_item(db, ids)
    return [
        ItemParaConclusao(i.quantidade_planejada, entregues.get(i.id, 0), canceladas.get(i.id, 0), nome)
        for i, nome in zip(itens, nomes, strict=True)
    ]


def _impedimentos(db: Session, instrumento_id: int, itens: list[ItemParaConclusao]) -> list[ImpedimentoRead]:
    impedimentos: list[ImpedimentoRead] = []
    if not itens:
        impedimentos.append(
            ImpedimentoRead(tipo="sem_item_controlado", descricao="O instrumento não tem item controlado por unidade.")
        )
    for item in itens:
        pendentes = unidades_pendentes(item)
        if pendentes:
            impedimentos.append(
                ImpedimentoRead(
                    tipo="item_pendente", descricao=f"{item.nome}: {pendentes} unidade(s) sem entrega nem cancelamento."
                )
            )
    itens_em_revisao = repo.contar_itens_em_revisao(db, instrumento_id)
    if itens_em_revisao:
        impedimentos.append(
            ImpedimentoRead(tipo="item_em_revisao", descricao=f"{itens_em_revisao} item(ns) na fila de revisão.")
        )
    exibidas = repo.listar_acoes_abertas(db, instrumento_id)
    for acao in exibidas:
        impedimentos.append(ImpedimentoRead(tipo="acao_aberta", descricao=f"Ação aberta: {acao.descricao[:120]}"))
    restantes = repo.contar_acoes_abertas(db, instrumento_id) - len(exibidas)
    if restantes > 0:
        impedimentos.append(ImpedimentoRead(tipo="acao_aberta", descricao=f"E mais {restantes} ação(ões) aberta(s)."))
    return impedimentos


def _situacao_inauguracao(db: Session, instrumento_id: int) -> InauguracaoConclusaoRead:
    if inauguracao_vigente(db, instrumento_id, MARCO_DISPENSADA) is not None:
        return InauguracaoConclusaoRead(situacao="dispensada")
    previsao = inauguracao_vigente(db, instrumento_id)
    if previsao is None:
        return InauguracaoConclusaoRead(situacao="sem_resposta")
    if previsao.data_ocorrencia is not None:
        return InauguracaoConclusaoRead(situacao="realizada", data_realizada=previsao.data_ocorrencia)
    return InauguracaoConclusaoRead(situacao="prevista", data_prevista=previsao.data_prevista)


def avaliar_conclusao(*, nr_convenio: str, db: Session, usuario: User) -> AvaliacaoConclusaoRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    itens = _itens_controlados(db, instrumento.id)
    resultado = calcular_resultado(itens)
    ativa = repo.obter_ativa(db, instrumento.id)
    legados = [] if ativa else repo.eventos_concluido_legado(db, instrumento.id)
    return AvaliacaoConclusaoRead(
        nr_convenio=nr_convenio,
        pode_editar=usuario_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id)),
        conclusao=_ler(ativa) if ativa else _ler_legado(legados[0]) if legados else None,
        resultado=resultado,
        exige_justificativa=resultado != "integral",
        itens_exigidos=len(itens),
        itens_completos=sum(1 for i in itens if unidades_pendentes(i) == 0),
        impedimentos=_impedimentos(db, instrumento.id, itens),
        inauguracao=_situacao_inauguracao(db, instrumento.id),
    )


def _registrar_inauguracao_informada(
    db: Session, instrumento: InstrumentoEquipamento, dados: ConclusaoCreate, usuario: User
) -> None:
    """Inauguração é opcional: sem data, nada acontece. Com data, ela vira a inauguração realizada do cronograma."""
    data = dados.data_inauguracao
    if data is None:
        return
    if data > date.today():
        raise ValidationError("A data de inauguração não pode estar no futuro.")
    if data > dados.data_conclusao:
        raise ValidationError("A inauguração não pode ser depois da data de conclusão.")
    if inauguracao_vigente(db, instrumento.id, MARCO_DISPENSADA) is not None:
        raise ValidationError("A inauguração foi dispensada para este instrumento.")
    existente = inauguracao_vigente(db, instrumento.id)
    if existente is not None and existente.data_ocorrencia is not None:
        if existente.data_ocorrencia != data:
            raise ValidationError(
                f"Já existe inauguração realizada em {existente.data_ocorrencia.strftime('%d/%m/%Y')}. "
                "Deixe o campo em branco ou corrija o evento na seção de eventos."
            )
        return
    fase = monitoramento_repo.obter_marco_por_codigo(db, "fase_concluido")
    registrar_inauguracao_realizada(
        db,
        instrumento=instrumento,
        data_ocorrencia=data,
        usuario=usuario,
        fase_geral_id=fase.id if fase else None,
        observacao="Inauguração confirmada ao concluir o acompanhamento.",
    )


def concluir_acompanhamento(*, nr_convenio: str, dados: ConclusaoCreate, db: Session, usuario: User) -> ConclusaoRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    travar_instrumento(db, instrumento.id)
    if repo.existe_ativa(db, instrumento.id):
        raise ConflictError("O acompanhamento já está concluído.")
    itens = _itens_controlados(db, instrumento.id)
    impedimentos = _impedimentos(db, instrumento.id, itens)
    if impedimentos:
        raise ValidationError("Há pendências que impedem a conclusão: " + " ".join(i.descricao for i in impedimentos))
    resultado = calcular_resultado(itens)
    if dados.resultado_confirmado != resultado:
        raise ConflictError("O resultado das entregas mudou. Recarregue a conclusão e confirme de novo.")
    if dados.data_conclusao > date.today():
        raise ValidationError("A data de conclusão não pode estar no futuro.")
    justificativa = (dados.justificativa or "").strip() or None
    if resultado != "integral" and justificativa is None:
        raise ValidationError("Informe a justificativa: a conclusão não é integral.")
    _registrar_inauguracao_informada(db, instrumento, dados, usuario)
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
    travar_instrumento(db, instrumento.id)
    conclusao = repo.obter_ativa(db, instrumento.id)
    legados = repo.eventos_concluido_legado(db, instrumento.id)
    if conclusao is None and not legados:
        raise NotFoundError("O acompanhamento não está concluído.")
    motivo = dados.motivo.strip()
    agora = datetime.now(timezone.utc)
    # O evento antigo `fase_concluido` pode coexistir com a conclusão confirmada (migração): reabrir desfaz os dois.
    for evento in legados:
        evento.deletado_em = agora
        evento.deletado_por_id = usuario.id
        evento.motivo_exclusao = motivo
    if legados:
        log_action(
            db,
            user_id=usuario.id,
            entity_name="instrumento_equipamento",
            entity_id=instrumento.id,
            action="reopened_legacy_conclusion",
            details={"nr_convenio": nr_convenio, "motivo": motivo},
        )
    if conclusao is None:
        db.commit()
        return _ler_legado(legados[0])
    conclusao.deletado_em = agora
    conclusao.deletado_por_id = usuario.id
    conclusao.motivo_exclusao = motivo
    log_action(
        db,
        user_id=usuario.id,
        entity_name="conclusao_instrumento",
        entity_id=conclusao.id,
        action="deleted",
        details={"nr_convenio": nr_convenio, "motivo": motivo},
    )
    db.commit()
    return _ler(conclusao)
