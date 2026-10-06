"""Recaptura oficial com SQL real; só a fronteira HTTP é substituída."""

from uuid import uuid4

import pytest
from sqlalchemy import func

from app.db.base import SessionLocal
from app.db.models import (
    EvidenciaTransfereGov,
    FonteCaptura,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
    PropostaCandidata,
    PropostaCandidataStatus,
)
from scripts import job_descoberta_transferegov as job
from scripts import job_verificacao_transferegov as verificacao
from scripts.levantamento_convenios_oncologia import COMPONENTES_ALVO


@pytest.fixture
def cenario(monkeypatch):
    db = SessionLocal()
    identificador = -int(uuid4().int % 10**12)
    ultima_captura = db.query(func.coalesce(func.max(FonteCaptura.id), 0)).scalar()
    proposta = PropostaCandidata(
        id_proposta=identificador,
        cnpj_ente_recebedor="12345678000199",
        nm_proponente="Hospital sintético",
        ds_objeto="Anterior",
        nm_programa=COMPONENTES_ALVO[0],
        id_programa=1,
        componente_batido=COMPONENTES_ALVO[0],
        status=PropostaCandidataStatus.rejeitada,
        metas_resumo={
            "_espelho": {"versao": 1},
            "proposta": {"id_proposta": identificador, "ds_objeto": "Anterior", "vl_total_planejamento_gastos": 100},
            "metas": [{"id_meta_proposta": 7, "nm_meta": "Anterior"}],
        },
    )
    db.add(proposta)
    db.commit()
    proposta_id = proposta.id
    resposta = {
        "proposta": [
            {
                "id_proposta": identificador,
                "ds_objeto": "Novo objeto",
                "nm_ente_recebedor": "Hospital sintético",
                "cnpj_ente_recebedor": "12345678000199",
                "vl_total_planejamento_gastos": 120,
            }
        ]
    }

    def paginar(endpoint, filtros, sessao):
        if endpoint == "programa":
            return [{"id_programa": 1, "nm_programa": COMPONENTES_ALVO[0]}]
        return resposta[endpoint]

    monkeypatch.setattr(job, "_paginar_transferegov", paginar)
    for nome in (
        "buscar_parcerias_por_proposta",
        "buscar_cronograma_por_proposta",
        "buscar_analises_por_proposta",
        "buscar_distribuicao_recurso_por_proposta",
    ):
        monkeypatch.setattr(job, nome, lambda *a, **k: [])
    monkeypatch.setattr(
        job, "buscar_metas_por_proposta", lambda *a, **k: [{"id_meta_proposta": 7, "nm_meta": "Nova meta"}]
    )
    yield db, proposta, resposta
    db.rollback()
    notificacoes = [
        n.id
        for n in db.query(Notificacao).filter(
            (Notificacao.tipo == NotificacaoTipo.proposta_candidata) & (Notificacao.entidade_id == proposta_id)
            | (Notificacao.tipo == NotificacaoTipo.fonte_indisponivel) & (Notificacao.entidade_id > ultima_captura)
        )
    ]
    db.query(NotificacaoDestinatario).filter(NotificacaoDestinatario.notificacao_id.in_(notificacoes)).delete()
    db.query(Notificacao).filter(Notificacao.id.in_(notificacoes)).delete()
    db.query(FonteCaptura).filter(FonteCaptura.id > ultima_captura).delete()
    db.query(EvidenciaTransfereGov).filter_by(proposta_candidata_id=proposta_id).delete()
    db.query(PropostaCandidata).filter_by(id=proposta_id).delete()
    db.commit()
    db.close()


def test_recaptura_metas_valores_objeto_sem_alterar_revisao_e_notifica_uma_vez(cenario):
    db, proposta, _ = cenario
    job.run()
    db.expire_all()
    assert proposta.status == PropostaCandidataStatus.rejeitada
    assert proposta.ds_objeto == "Novo objeto"
    assert proposta.vl_global_proposta == 120
    assert proposta.metas_resumo["metas"][0]["nm_meta"] == "Nova meta"
    avisos = db.query(Notificacao).filter_by(tipo=NotificacaoTipo.proposta_candidata, entidade_id=proposta.id).all()
    assert len(avisos) == 1
    assert "proposta.ds_objeto: Anterior → Novo objeto" in avisos[0].corpo
    assert "metas[7].nm_meta: Anterior → Nova meta" in avisos[0].corpo
    job.run()
    db.expire_all()
    assert (
        db.query(Notificacao).filter_by(tipo=NotificacaoTipo.proposta_candidata, entidade_id=proposta.id).count() == 1
    )


def test_sem_baseline_atualiza_silenciosamente(cenario):
    db, proposta, _ = cenario
    proposta.metas_resumo = {"proposta": {"id_proposta": proposta.id_proposta}}
    db.commit()
    job.run()
    db.expire_all()
    assert proposta.ds_objeto == "Novo objeto"
    assert (
        db.query(Notificacao).filter_by(tipo=NotificacaoTipo.proposta_candidata, entidade_id=proposta.id).count() == 0
    )


def test_monitorado_recebe_um_aviso_e_verificacao_seguinte_nao_duplica(cenario, monkeypatch):
    from app.db.models import InstrumentoEquipamento

    db, proposta, _ = cenario
    instrumento = InstrumentoEquipamento(
        nr_convenio=str(proposta.id_proposta),
        nome_convenente="Hospital sintético",
        tipo_contratacao="Parceria TransfereGov",
        situacao_parceria_transferegov="Aprovada",
        situacao_ordem_pagamento_transferegov="Emitida",
    )
    db.add(instrumento)
    db.commit()
    instrumento_id = instrumento.id
    try:
        parceria = {
            "id_parceria": 4,
            "cd_parceria": f"TESTE{proposta.id_proposta}",
            "in_situacao_parceria": "Em Execução",
        }
        for modulo in (job, verificacao):
            monkeypatch.setattr(modulo, "buscar_parcerias_por_proposta", lambda *a, **k: [parceria])
            monkeypatch.setattr(
                modulo, "buscar_documentos_habeis_por_parceria", lambda *a, **k: [{"id_documento_habil": 7}]
            )
            monkeypatch.setattr(
                modulo,
                "buscar_ordens_pagamento_por_documento",
                lambda *a, **k: [{"id_op": 9, "dt_emissao_op": "2026-10-06", "in_situacao_op": "Paga"}],
            )
        monkeypatch.setattr(job, "buscar_contas_por_parceria", lambda *a, **k: [])
        monkeypatch.setattr(job, "buscar_empenhos_por_parceria", lambda *a, **k: [])
        job.run()
        verificacao.run()
        db.expire_all()
        assert instrumento.situacao_parceria_transferegov == "Em Execução"
        assert instrumento.situacao_ordem_pagamento_transferegov == "Paga"
        assert (
            db.query(Notificacao).filter_by(tipo=NotificacaoTipo.atualizacao_api, entidade_id=instrumento_id).count()
            == 1
        )
        assert (
            db.query(Notificacao).filter_by(tipo=NotificacaoTipo.proposta_candidata, entidade_id=proposta.id).count()
            == 0
        )
    finally:
        ids = [
            n.id
            for n in db.query(Notificacao).filter_by(tipo=NotificacaoTipo.atualizacao_api, entidade_id=instrumento_id)
        ]
        db.query(NotificacaoDestinatario).filter(NotificacaoDestinatario.notificacao_id.in_(ids)).delete()
        db.query(Notificacao).filter(Notificacao.id.in_(ids)).delete()
        db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
        db.commit()


def test_falha_http_na_recaptura_preserva_payload_e_nao_notifica_mudanca(cenario, monkeypatch):
    db, proposta, _ = cenario
    original = proposta.metas_resumo

    def falhar(*args, **kwargs):
        raise TimeoutError("Fonte indisponível")

    monkeypatch.setattr(job, "buscar_analises_por_proposta", falhar)
    with pytest.raises(TimeoutError):
        job.run()
    db.expire_all()
    assert proposta.metas_resumo == original
    assert proposta.ds_objeto == "Anterior"
    assert (
        db.query(Notificacao).filter_by(tipo=NotificacaoTipo.proposta_candidata, entidade_id=proposta.id).count() == 0
    )
