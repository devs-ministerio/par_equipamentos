from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import AuditLog, EventoMarco, InstrumentoEquipamento, MarcoCatalogo
from scripts.migrar_eventos_inauguracao_prevista import executar


@pytest.mark.db
def test_migracao_cria_previsao_e_preserva_evento_original():
    db = SessionLocal()
    sufixo = str(uuid4())
    instrumento = InstrumentoEquipamento(nr_convenio=f"PYTEST-PREV-{sufixo}", nome_convenente="Pytest")
    evento: EventoMarco | None = None
    try:
        marco = db.execute(
            select(MarcoCatalogo).where(MarcoCatalogo.codigo == "cronograma_previsao_inauguracao")
        ).scalar_one()
        db.add(instrumento)
        db.commit()
        evento = EventoMarco(
            instrumento_id=instrumento.id,
            marco_id=marco.id,
            data_ocorrencia=date.today() + timedelta(days=10),
        )
        db.add(evento)
        db.commit()

        assert executar(dry_run=True)["eventos_migrados"] >= 1
        db.refresh(evento)
        assert evento.substituido_por_id is None

        assert executar(dry_run=False, backup_reference="pytest-snapshot")["eventos_migrados"] >= 1
        db.refresh(evento)
        assert evento.substituido_por_id is not None
        substituto = db.get(EventoMarco, evento.substituido_por_id)
        assert substituto is not None
        assert substituto.data_ocorrencia is None
        assert substituto.data_prevista == date.today() + timedelta(days=10)
        assert executar(dry_run=True).get("eventos_migrados", 0) == 0
    finally:
        db.rollback()
        if evento is not None and evento.id is not None:
            db.query(AuditLog).filter_by(entity_name="evento_marco", entity_id=evento.id).delete()
            db.query(EventoMarco).filter_by(instrumento_id=instrumento.id).delete()
        if instrumento.id is not None:
            db.delete(instrumento)
        db.commit()
        db.close()


def test_migracao_exige_backup_para_apply():
    with pytest.raises(ValueError, match="backup-reference"):
        executar(dry_run=False)
