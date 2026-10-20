"""Leituras atuais para revisão, sem autorização ou commit no Repository."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Convenio, User


def bloquear_usuario_atual(db: Session, usuario_id: int) -> User | None:
    return db.scalar(
        select(User).where(User.id == usuario_id).with_for_update(read=True).execution_options(populate_existing=True)
    )


def numero_na_carteira(db: Session, numero: str) -> bool:
    return db.scalar(select(Convenio.id).where(Convenio.numero == numero).limit(1)) is not None
