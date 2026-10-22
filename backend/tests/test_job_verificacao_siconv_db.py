"""Valida a reconciliação SICONV de ponta a ponta no PostgreSQL de teste."""

from uuid import uuid4

from app.db.base import SessionLocal
from app.db.models import Convenio, InstrumentoEquipamento, Notificacao, NotificacaoTipo
from scripts import job_verificacao_siconv


def test_job_atualiza_duas_visoes_e_notifica_uma_vez(monkeypatch):
    numero = str(uuid4().int)[:12]
    situacao_nova = "Prestação de Contas Concluída"
    db = SessionLocal()
    instrumento_id = None
    try:
        convenio = Convenio(
            numero=numero,
            convenente_nome="Teste SIGEO",
            tipo_contratacao="Convênio",
            situacao="Em execução",
            siconv_raw={"_espelho": {"versao": 1}, "convenio": {"SIT_CONVENIO": "Em execução"}},
        )
        instrumento = InstrumentoEquipamento(
            nr_convenio=numero,
            nome_convenente="Teste SIGEO",
            tipo_contratacao="Convênio",
            situacao_prestacao_contas="Em execução",
        )
        db.add_all([convenio, instrumento])
        db.commit()
        db.refresh(instrumento)
        instrumento_id = instrumento.id

        def fonte(nome, numeros, *, atualizar_cache):
            assert numero in numeros
            assert atualizar_cache is True
            return [{"NR_CONVENIO": numero, "SIT_CONVENIO": situacao_nova}] if nome == "siconv_convenio" else []

        monkeypatch.setattr(job_verificacao_siconv, "_filtrar_por_numero_convenio", fonte)
        monkeypatch.setattr(job_verificacao_siconv, "_filtrar_plano_aplicacao_por_id_proposta", lambda *a, **k: [])
        job_verificacao_siconv.run()
        db.expire_all()
        assert db.query(Convenio).filter_by(numero=numero).one().situacao == situacao_nova
        assert (
            db.query(InstrumentoEquipamento).filter_by(nr_convenio=numero).one().situacao_prestacao_contas
            == situacao_nova
        )
        assert (
            db.query(Notificacao).filter_by(tipo=NotificacaoTipo.atualizacao_api, entidade_id=instrumento_id).count()
            == 1
        )

        job_verificacao_siconv.run()
        db.expire_all()
        assert (
            db.query(Notificacao).filter_by(tipo=NotificacaoTipo.atualizacao_api, entidade_id=instrumento_id).count()
            == 1
        )
    finally:
        if instrumento_id is not None:
            db.query(Notificacao).filter_by(tipo=NotificacaoTipo.atualizacao_api, entidade_id=instrumento_id).delete()
        db.query(InstrumentoEquipamento).filter_by(nr_convenio=numero).delete()
        db.query(Convenio).filter_by(numero=numero).delete()
        db.commit()
        db.close()
