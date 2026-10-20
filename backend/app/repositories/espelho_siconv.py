"""Escopo conhecido e bloqueios de publicação; nenhuma consulta HTTP ou commit."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Convenio, InstrumentoEquipamento


def numeros_oficiais_conhecidos(db: Session) -> set[str]:
    consulta = (
        select(Convenio.numero)
        .where(Convenio.tipo_contratacao == "Convênio")
        .union(select(InstrumentoEquipamento.nr_convenio).where(InstrumentoEquipamento.tipo_contratacao == "Convênio"))
    )
    return set(db.scalars(consulta))


def bloquear_escopo_atual(
    db: Session, numeros: set[str]
) -> tuple[dict[str, Convenio], dict[str, InstrumentoEquipamento]]:
    """Relê sob lock: exclusão/retipificação durante a coleta não é revertida."""
    convenios = db.scalars(
        select(Convenio)
        .where(Convenio.numero.in_(numeros), Convenio.tipo_contratacao == "Convênio")
        .order_by(Convenio.id)
        .with_for_update()
    )
    por_convenio = {registro.numero: registro for registro in convenios}
    instrumentos = db.scalars(
        select(InstrumentoEquipamento)
        .where(
            InstrumentoEquipamento.nr_convenio.in_(numeros),
            InstrumentoEquipamento.tipo_contratacao == "Convênio",
        )
        .order_by(InstrumentoEquipamento.id)
        .with_for_update()
    )
    return por_convenio, {registro.nr_convenio: registro for registro in instrumentos}
