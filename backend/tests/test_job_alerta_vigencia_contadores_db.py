"""Contador de alertas concilia com gravações reais e reenvio idempotente."""

from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy import func

from app.db.base import SessionLocal
from app.db.models import Convenio, Notificacao, NotificacaoDestinatario, NotificacaoTipo
from scripts.job_alerta_vigencia import run


def test_contador_confere_com_alertas_persistidos_e_replay_nao_duplica():
    # Arrange: conftest exige PostgreSQL dedicado e nunca usa DATABASE_URL real.
    db = SessionLocal()
    ultimo_id = db.query(func.coalesce(func.max(Notificacao.id), 0)).scalar()
    convenio = Convenio(
        numero=str(uuid4().int)[:12],
        convenente_nome="Instituição sintética",
        tipo_contratacao="Convênio",
        fora_escopo_equipamentos=False,
        data_final_vigencia=date.today() + timedelta(days=30),
    )
    db.add(convenio)
    db.commit()
    identificador = convenio.id
    try:
        # Act
        emitidos = run()
        repeticao = run()
        db.expire_all()
        criadas = (
            db.query(Notificacao)
            .filter(Notificacao.id > ultimo_id, Notificacao.tipo == NotificacaoTipo.alerta_vigencia)
            .all()
        )
        # Assert
        assert emitidos == len(criadas)
        assert len([n for n in criadas if n.entidade_id == identificador]) == 1
        assert repeticao == 0
    finally:
        ids = [
            n.id
            for n in db.query(Notificacao).filter(
                Notificacao.id > ultimo_id, Notificacao.tipo == NotificacaoTipo.alerta_vigencia
            )
        ]
        db.query(NotificacaoDestinatario).filter(NotificacaoDestinatario.notificacao_id.in_(ids)).delete()
        db.query(Notificacao).filter(Notificacao.id.in_(ids)).delete()
        db.query(Convenio).filter(Convenio.id == identificador).delete()
        db.commit()
        db.close()
