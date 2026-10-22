"""Inserção estrita da projeção; sem upsert, commit ou cadastro pós-repasse."""

from sqlalchemy.orm import Session

from app.db.models import Convenio
from app.schemas_projecao_legado import ProjecaoCarteiraLegado


def adicionar(db: Session, projecao: ProjecaoCarteiraLegado) -> Convenio:
    convenio = Convenio(**projecao.model_dump())
    db.add(convenio)
    db.flush()
    return convenio
