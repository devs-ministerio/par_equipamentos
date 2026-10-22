"""Leitura paginada de evidências automáticas; nunca reclassifica registros."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador


@dataclass(frozen=True)
class EvidenciaParaAuditoria:
    marcador_id: int
    numero_convenio: str | None
    codigo: str
    descricao: str
    relacao: str
    tipo_evidencia: str


def listar_evidencias_automaticas(db: Session, *, depois_id: int = 0) -> list[EvidenciaParaAuditoria]:
    linhas = db.execute(
        select(
            EquipamentoMarcador.id,
            Convenio.numero,
            EquipamentoCatalogo.codigo,
            EquipamentoMarcador.descricao_original,
            EquipamentoMarcador.relacao,
            EquipamentoMarcador.tipo_evidencia,
        )
        .join(EquipamentoCatalogo, EquipamentoCatalogo.id == EquipamentoMarcador.equipamento_catalogo_id)
        .outerjoin(Convenio, Convenio.id == EquipamentoMarcador.convenio_id)
        .where(
            EquipamentoMarcador.id > depois_id,
            EquipamentoMarcador.tipo_evidencia.in_(("item_orcamentario", "meta", "objeto", "legado")),
        )
        .order_by(EquipamentoMarcador.id)
        .limit(200)
    ).all()
    return [EvidenciaParaAuditoria(*linha) for linha in linhas]
