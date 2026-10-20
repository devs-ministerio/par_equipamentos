"""Lock, replay e histórico paginado das decisões humanas do Radar."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.models_legado import CandidatoLegadoDecisao, CandidatoLegadoRegistro
from app.schemas_legado import HistoricoLegadoItem, HistoricoLegadoRead


def bloquear_candidato(db: Session, candidato_id: int) -> CandidatoLegadoRegistro | None:
    return db.scalar(
        select(CandidatoLegadoRegistro)
        .where(CandidatoLegadoRegistro.id == candidato_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def ultima_decisao(db: Session, candidato_id: int) -> CandidatoLegadoDecisao | None:
    return db.scalar(
        select(CandidatoLegadoDecisao)
        .where(CandidatoLegadoDecisao.candidato_id == candidato_id)
        .order_by(CandidatoLegadoDecisao.id.desc())
        .limit(1)
    )


def obter_replay(db: Session, candidato_id: int, chave: UUID) -> CandidatoLegadoDecisao | None:
    return db.scalar(
        select(CandidatoLegadoDecisao).where(
            CandidatoLegadoDecisao.candidato_id == candidato_id, CandidatoLegadoDecisao.chave == chave
        )
    )


def adicionar(db: Session, decisao: CandidatoLegadoDecisao) -> None:
    db.add(decisao)
    db.flush()


def versao_antes_de(db: Session, candidato_id: int, decisao_id: int) -> int:
    return (
        db.scalar(
            select(func.max(CandidatoLegadoDecisao.id)).where(
                CandidatoLegadoDecisao.candidato_id == candidato_id,
                CandidatoLegadoDecisao.id < decisao_id,
            )
        )
        or 0
    )


def listar_historico(db: Session, candidato_id: int, pagina: int, tamanho: int) -> HistoricoLegadoRead:
    total = (
        db.scalar(
            select(func.count())
            .select_from(CandidatoLegadoDecisao)
            .where(CandidatoLegadoDecisao.candidato_id == candidato_id)
        )
        or 0
    )
    registros = db.execute(
        select(CandidatoLegadoDecisao, User.name)
        .join(User, User.id == CandidatoLegadoDecisao.usuario_id)
        .where(CandidatoLegadoDecisao.candidato_id == candidato_id)
        .order_by(CandidatoLegadoDecisao.id.desc())
        .limit(tamanho)
        .offset((pagina - 1) * tamanho)
    )
    itens = [
        HistoricoLegadoItem.model_validate(
            {
                "id": d.id,
                "candidato_id": d.candidato_id,
                "captura_id": d.captura_id,
                "usuario_id": d.usuario_id,
                "usuario_nome": nome,
                "situacao_anterior": d.situacao_anterior,
                "situacao": d.situacao,
                "justificativa": d.justificativa,
                "criado_em": d.criado_em,
            }
        )
        for d, nome in registros
    ]
    return HistoricoLegadoRead(total=total, itens=itens)
