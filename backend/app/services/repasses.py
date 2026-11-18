"""Confirmação de repasse (integral ou parcial) e fase calculada do acompanhamento.

A fonte (desembolso do SICONV) e o técnico confirmam; a confirmação manual prevalece sobre a da fonte.
Registros são append-only: trocar o tipo encerra o vigente e insere o novo, sempre com `AuditLog`.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento
from app.db.models import InstrumentoEquipamento, RepasseInstrumento, User
from app.domain_errors import NotFoundError
from app.repositories import conclusoes as conclusoes_repo
from app.repositories import monitoramento as monitoramento_repo
from app.repositories import repasses as repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.schemas_repasses import RepasseCreate, RepasseRead, SituacaoRepasseRead
from app.services.fase_acompanhamento import FaseAcompanhamento, FatosAcompanhamento, calcular_fase_acompanhamento

_TOLERANCIA_REAIS = 1.0


def _instrumento_ou_404(db: Session, nr_convenio: str) -> InstrumentoEquipamento:
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    return instrumento


def _repasse_vigente(repasses: list[RepasseInstrumento]) -> RepasseInstrumento | None:
    """A confirmação manual prevalece sobre a da fonte."""
    manuais = [r for r in repasses if r.origem == "manual"]
    return manuais[-1] if manuais else (repasses[-1] if repasses else None)


def tipo_repasse_pela_fonte(*, valor_previsto: float | None, desembolsos: list[dict]) -> str | None:
    """Sem desembolso, nada a confirmar. Integral só quando o desembolsado cobre o repasse previsto."""
    desembolsado = 0.0
    for d in desembolsos:
        try:
            desembolsado += float(str(d.get("VL_DESEMBOLSADO") or 0).replace(",", "."))
        except ValueError:
            continue
    if desembolsado <= 0:
        return None
    if valor_previsto is not None and valor_previsto > 0 and desembolsado + _TOLERANCIA_REAIS >= valor_previsto:
        return "integral"
    return "parcial"


def _gravar_repasse(
    db: Session,
    *,
    instrumento: InstrumentoEquipamento,
    tipo: str,
    origem: str,
    justificativa: str | None,
    usuario: User | None,
) -> RepasseInstrumento:
    """Idempotente: o mesmo tipo e origem vigente devolve o existente; tipo diferente substitui."""
    vigente = next(
        (r for r in repo.listar_repasses_ativos(db, instrumento.id) if r.origem == origem),
        None,
    )
    if vigente is not None and vigente.tipo == tipo:
        return vigente
    agora = datetime.now(timezone.utc)
    if vigente is not None:
        repo.encerrar_repasse(db, vigente, agora=agora, motivo="Substituído por nova confirmação")
    novo = repo.adicionar_repasse(
        db,
        RepasseInstrumento(
            instrumento_id=instrumento.id,
            tipo=tipo,
            origem=origem,
            justificativa=justificativa,
            autor_id=usuario.id if usuario else None,
        ),
    )
    if vigente is not None:
        repo.ligar_substituto(db, vigente, novo)
    log_action(
        db,
        user_id=usuario.id if usuario else None,
        entity_name="repasse_instrumento",
        entity_id=novo.id,
        action="created",
        details={
            "nr_convenio": instrumento.nr_convenio,
            "tipo": tipo,
            "origem": origem,
            "substitui": vigente.id if vigente else None,
        },
    )
    return novo


def registrar_repasse_manual(*, nr_convenio: str, dados: RepasseCreate, db: Session, usuario: User) -> RepasseRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))
    repasse = _gravar_repasse(
        db,
        instrumento=instrumento,
        tipo=dados.tipo,
        origem="manual",
        justificativa=dados.justificativa,
        usuario=usuario,
    )
    db.commit()
    return RepasseRead.model_validate(repasse)


def derivar_repasse_da_fonte(*, instrumento: InstrumentoEquipamento, db: Session) -> RepasseInstrumento | None:
    """Usado pelo script de carga: grava o repasse da fonte quando há desembolso. Quem chama commita."""
    tipo = tipo_repasse_pela_fonte(
        valor_previsto=repo.obter_valor_repasse_previsto(db, instrumento.nr_convenio),
        desembolsos=repo.obter_desembolsos_siconv(db, instrumento.nr_convenio),
    )
    if tipo is None:
        return None
    return _gravar_repasse(db, instrumento=instrumento, tipo=tipo, origem="fonte", justificativa=None, usuario=None)


def fatos_do_instrumento(db: Session, instrumento: InstrumentoEquipamento) -> FatosAcompanhamento:
    repasse = _repasse_vigente(repo.listar_repasses_ativos(db, instrumento.id))
    previsto = repo.obter_valor_repasse_previsto(db, instrumento.nr_convenio)
    return FatosAcompanhamento(
        repasse_previsto=bool(previsto and previsto > 0)
        or repo.existe_evento_ativo_de_marcos(db, instrumento.id, (repo.CODIGO_AGUARDANDO_REPASSE,)),
        repasse_tipo=repasse.tipo if repasse else None,
        aquisicao_iniciada=repo.existe_evento_ativo_de_marcos(db, instrumento.id, repo.CODIGOS_AQUISICAO),
        entrega_lancada=repo.existe_entrega_ativa(db, instrumento.id),
        pos_entrega_iniciada=repo.existe_evento_realizado_de_marcos(db, instrumento.id, repo.CODIGOS_POS_ENTREGA),
        concluido=repo.existe_evento_ativo_de_marcos(db, instrumento.id, (repo.CODIGO_CONCLUIDO,))
        or conclusoes_repo.existe_ativa(db, instrumento.id),
    )


def obter_situacao_repasse(*, nr_convenio: str, db: Session) -> SituacaoRepasseRead:
    instrumento = _instrumento_ou_404(db, nr_convenio)
    vigente = _repasse_vigente(repo.listar_repasses_ativos(db, instrumento.id))
    fatos = fatos_do_instrumento(db, instrumento)
    return SituacaoRepasseRead(
        repasse=RepasseRead.model_validate(vigente) if vigente else None,
        repasse_previsto=fatos.repasse_previsto,
        fase_calculada=calcular_fase_acompanhamento(fatos).value,
    )


def fases_calculadas_em_lote(db: Session, instrumentos: list[InstrumentoEquipamento]) -> dict[int, FaseAcompanhamento]:
    """Fase calculada de vários instrumentos com uma consulta por fato (mesma regra de `fatos_do_instrumento`)."""
    ids = [i.id for i in instrumentos]
    repasses = repo.repasses_ativos_por_instrumento(db, ids)
    previstos = repo.valores_repasse_previsto(db, [i.nr_convenio for i in instrumentos])
    aguardando = repo.ids_com_evento_de_marcos(db, ids, (repo.CODIGO_AGUARDANDO_REPASSE,))
    aquisicao = repo.ids_com_evento_de_marcos(db, ids, repo.CODIGOS_AQUISICAO)
    entregas = repo.ids_com_entrega_ativa(db, ids)
    pos_entrega = repo.ids_com_evento_de_marcos(db, ids, repo.CODIGOS_POS_ENTREGA, realizado=True)
    concluidos = repo.ids_com_evento_de_marcos(
        db, ids, (repo.CODIGO_CONCLUIDO,)
    ) | conclusoes_repo.ids_com_conclusao_ativa(db, ids)
    resultado: dict[int, FaseAcompanhamento] = {}
    for instrumento in instrumentos:
        vigente = _repasse_vigente(repasses.get(instrumento.id, []))
        previsto = previstos.get(instrumento.nr_convenio)
        resultado[instrumento.id] = calcular_fase_acompanhamento(
            FatosAcompanhamento(
                repasse_previsto=bool(previsto and previsto > 0) or instrumento.id in aguardando,
                repasse_tipo=vigente.tipo if vigente else None,
                aquisicao_iniciada=instrumento.id in aquisicao,
                entrega_lancada=instrumento.id in entregas,
                pos_entrega_iniciada=instrumento.id in pos_entrega,
                concluido=instrumento.id in concluidos,
            )
        )
    return resultado
