"""Primeira descoberta oficial: aviso transacional, não aprovação. Não espera o Portal."""

from sqlalchemy.orm import Session

from app.db.models import Notificacao, NotificacaoTipo
from app.domain_errors import ConflictError
from app.repositories import candidatos_legados as candidatos_repo
from app.repositories.notificacoes import criar_avisos_descoberta
from app.schemas_legado import ReferenciaDescoberta
from app.services.descoberta_legado import CandidatoLegado


def planejar_avisos(
    db: Session, candidatos: list[CandidatoLegado], referencia: ReferenciaDescoberta, *, notificar_novos: bool
) -> set[str]:
    # Baseline explícita pode ser silenciosa.
    if not notificar_novos:
        return set()
    numeros = {
        c.numero
        for c in candidatos
        if c.criterio_escopo == "prioritarios_ms_celebrados_v2" and c.orgao_superior == "36000"
    }
    return numeros - candidatos_repo.numeros_ja_descobertos_oficialmente(db, numeros)


def emitir_avisos(db: Session, numeros: set[str]) -> None:
    if not numeros:
        return
    registros = candidatos_repo.obter_registros(db, numeros)
    if set(registros) != numeros:
        raise ConflictError("Descoberta oficial sem identidade persistida para notificação.")
    criar_avisos_descoberta(
        db,
        [
            Notificacao(
                tipo=NotificacaoTipo.convenio_descoberto,
                entidade_id=registros[numero].id,
                titulo=f"Convênio {numero}: novo no Radar",
                corpo="Descoberta oficial no recorte de equipamentos do Ministério da Saúde. Aguardando análise no Radar; ainda não incluído na carteira. Aprovar exige a confirmação no Portal da Transparência.",
            )
            for numero in sorted(numeros)
        ],
    )
