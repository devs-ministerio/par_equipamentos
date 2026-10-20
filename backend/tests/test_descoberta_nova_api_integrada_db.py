"""HTTP externo → job → proposta/evidência/aviso reais, sem monitoramento automático."""

import json
from functools import partial

import pytest
from requests import Response, Session
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.catalogo_componentes import COMPONENTES_ALVO
from app.db.models import (
    Convenio,
    EquipamentoCatalogo,
    EvidenciaTransfereGov,
    FonteCaptura,
    InstrumentoEquipamento,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
    PropostaCandidata,
    PropostaCandidataStatus,
)
from app.services.capturas_fonte import captura
from scripts import job_descoberta_transferegov as job
from tests.test_notificacoes_destinatarios_db import matriz as matriz


def quantidade(db, modelo):
    return db.scalar(select(func.count()).select_from(modelo))


@pytest.fixture
def descoberta(matriz, monkeypatch):
    db, usuarios, *_ = matriz
    db.add(EquipamentoCatalogo(codigo="mamografo", nome="Mamógrafo", prioritario=True))
    db.commit()
    programas = [
        {"id_programa": 1, "nm_programa": COMPONENTES_ALVO[0], "sg_ente_superior": "MS"},
        {"id_programa": 2, "nm_programa": COMPONENTES_ALVO[0], "sg_ente_superior": "MCTI"},
        {"id_programa": 3, "nm_programa": COMPONENTES_ALVO[0] + " - CURSO", "sg_ente_superior": "MS"},
    ]
    propostas = [
        {
            "id_proposta": numero,
            "id_programa": 1,
            "ds_objeto": "Aquisição de mamógrafo",
            "nm_ente_recebedor": "Instituição sintética",
            "cnpj_ente_recebedor": "00000000000000",
            "vl_total_planejamento_gastos": 100,
            "situacao_proposta": "Em análise",
        }
        for numero in (101, 102)
    ]
    chamadas = []
    defeito = {"recurso": None}

    def consultar(self, url, *, params, timeout):
        recurso = url.rsplit("/", 1)[-1]
        registros: object
        chamadas.append((recurso, params.copy()))
        resposta = Response()
        resposta.status_code = 200
        if recurso == defeito["recurso"] and params.get("id_proposta") == 102:
            resposta._content = b"{}"
            return resposta
        if recurso == "programa":
            registros = programas
        elif recurso == "proposta":
            assert params["id_programa"] == 1  # Outro órgão/curso nem consulta proposta.
            registros = propostas
        elif recurso == "meta-proposta":
            registros = [{"id_meta_proposta": params["id_proposta"], "nm_meta": "Aquisição", "etapas_proposta": []}]
        else:
            registros = []
        resposta._content = json.dumps({"data": registros, "total_pages": 1}).encode()
        return resposta

    fabrica = sessionmaker(bind=db.get_bind())
    monkeypatch.setattr(job, "SessionLocal", fabrica)
    monkeypatch.setattr(job, "captura", partial(captura, fabrica_sessao=fabrica))
    monkeypatch.setattr(Session, "get", consultar)
    return db, usuarios, propostas, chamadas, defeito


def test_novas_vao_para_propostas_sem_criar_carteira_monitoramento_e_replay_nao_duplica(descoberta):
    # Arrange
    db, usuarios, _, chamadas, _ = descoberta
    iniciais = quantidade(db, Convenio), quantidade(db, InstrumentoEquipamento)
    # Act
    job.run()
    job.run()
    db.expire_all()
    # Assert: duas propostas reais no destino usado por Em tramitação; baseline-resumo único.
    propostas = list(db.scalars(select(PropostaCandidata).order_by(PropostaCandidata.id_proposta)))
    assert [p.id_proposta for p in propostas] == [101, 102]
    assert all(
        p.status == PropostaCandidataStatus.pendente and p.componente_batido == COMPONENTES_ALVO[0] for p in propostas
    )
    assert quantidade(db, Convenio) == iniciais[0] and quantidade(db, InstrumentoEquipamento) == iniciais[1]
    evidencias = list(db.scalars(select(EvidenciaTransfereGov)))
    assert len(evidencias) == 4
    assert {e.tipo_recurso for e in evidencias} == {"proposta", "meta-proposta"}
    assert {e.proposta_candidata_id for e in evidencias} == {p.id for p in propostas}
    avisos = list(db.scalars(select(Notificacao)))
    assert len(avisos) == 1 and avisos[0].tipo == NotificacaoTipo.proposta_candidata
    assert "2 proposta(s)" in avisos[0].titulo
    assert set(db.scalars(select(NotificacaoDestinatario.usuario_id))) == {
        usuarios[n].id for n in ("admin", "gestor", "titular", "suplente", "outro")
    }
    rodadas = list(db.scalars(select(FonteCaptura).order_by(FonteCaptura.id)))
    assert [(r.status, r.itens_verificados, r.itens_alterados, r.avisos_criados) for r in rodadas] == [
        ("ok", 2, 2, 1),
        ("ok", 2, 0, 0),
    ]
    assert all(params["id_programa"] == 1 for recurso, params in chamadas if recurso == "proposta")


@pytest.mark.parametrize("recurso", ["meta-proposta", "cronograma-desembolso", "analise-proposta"])
def test_falha_na_segunda_nova_reverte_primeira_e_resumo_sem_falsa_novidade(descoberta, recurso):
    # Arrange
    db, usuarios, _, _, defeito = descoberta
    defeito["recurso"] = recurso
    # Act
    with pytest.raises(ValueError, match="Envelope paginado"):
        job.run()
    db.expire_all()
    # Assert: apenas tentativa de erro e alerta gerencial; nenhum aviso de descoberta.
    assert quantidade(db, PropostaCandidata) == quantidade(db, EvidenciaTransfereGov) == 0
    rodada = db.scalar(select(FonteCaptura))
    assert rodada.status == "erro"
    aviso = db.scalar(select(Notificacao))
    assert aviso.tipo == NotificacaoTipo.fonte_indisponivel
    assert set(db.scalars(select(NotificacaoDestinatario.usuario_id))) == {usuarios["admin"].id, usuarios["gestor"].id}


def test_mudanca_de_campo_depois_da_descoberta_respeita_revisao_e_nao_repete_novidade(descoberta):
    # Arrange
    db, _, fonte, _, _ = descoberta
    job.run()
    proposta = db.scalar(select(PropostaCandidata).where(PropostaCandidata.id_proposta == 101))
    proposta.status = PropostaCandidataStatus.rejeitada
    db.commit()
    fonte[0]["vl_total_planejamento_gastos"] = 120
    # Act
    job.run()
    job.run()
    db.expire_all()
    # Assert
    assert proposta.status == PropostaCandidataStatus.rejeitada and proposta.vl_global_proposta == 120
    avisos = list(db.scalars(select(Notificacao).order_by(Notificacao.id)))
    assert len(avisos) == 2 and "100 → 120" in avisos[1].corpo
    assert quantidade(db, PropostaCandidata) == 2


@pytest.mark.parametrize("identidade", [True, 0, -1, "102", None])
def test_identidade_invalida_na_lista_nao_publica_descoberta_incompleta(descoberta, identidade):
    # Arrange: primeira proposta válida não pode ser publicada isoladamente.
    db, _, fonte, _, _ = descoberta
    fonte[1]["id_proposta"] = identidade
    # Act
    with pytest.raises(ValueError):
        job.run()
    db.expire_all()
    # Assert: somente erro operacional, nunca sucesso vazio ou aviso de novidade.
    assert quantidade(db, PropostaCandidata) == quantidade(db, EvidenciaTransfereGov) == 0
    assert db.scalar(select(FonteCaptura)).status == "erro"
    assert db.scalar(select(Notificacao)).tipo == NotificacaoTipo.fonte_indisponivel
