"""Descoberta → captura → aviso em uma transação, PostgreSQL sintético."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import EquipamentoCatalogo, Notificacao, NotificacaoDestinatario
from app.db.models_legado import CandidatoLegadoCaptura, CandidatoLegadoRegistro
from app.domain_errors import ValidationError
from app.schemas_legado import ReferenciaDescoberta
from app.services.candidatos_legados import registrar_descoberta
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import candidato
from tests.test_prova_recaptura_legado import dados as dados


@pytest.fixture
def contexto(matriz, dados):
    db, usuarios, *_ = matriz
    db.add(EquipamentoCatalogo(codigo="mamografo", nome="Mamógrafo", prioritario=True))
    db.commit()
    return db, usuarios, candidato(dados)


def coletar(db, c, *, origem="siconv_oficial", notificar=True):
    return registrar_descoberta(
        db=db,
        candidatos=[c],
        referencia=ReferenciaDescoberta(origem=origem, hash_snapshot="a" * 64),
        notificar_novos=notificar,
    )


def quantidade(db, modelo):
    return db.scalar(select(func.count()).select_from(modelo))


def test_primeira_oficial_gera_um_aviso_replay_nao_duplica(contexto):
    db, usuarios, c = contexto
    assert coletar(db, c) == 1
    assert coletar(db, c) == 0
    registro = db.scalar(select(CandidatoLegadoRegistro))
    aviso = db.scalar(select(Notificacao))
    assert aviso.tipo.value == "convenio_descoberto" and aviso.entidade_id == registro.id
    assert quantidade(db, Notificacao) == quantidade(db, CandidatoLegadoCaptura) == 1
    assert set(db.scalars(select(NotificacaoDestinatario.usuario_id))) == {usuarios["admin"].id, usuarios["gestor"].id}


@pytest.mark.parametrize("defeito", ["snapshot", "escopo_v1", "sem_confirmacao", "sem_escopo"])
def test_diagnostico_nao_notifica_nem_suprime_futura_descoberta_oficial(contexto, defeito):
    db, _, c = contexto
    inicial = c
    if defeito == "escopo_v1":
        inicial = c.model_copy(update={"criterio_escopo": "prioritarios_ms_v1"})
    elif defeito == "sem_escopo":
        inicial = c.model_copy(update={"criterio_escopo": None, "orgao_superior": None})
    elif defeito == "sem_confirmacao":
        inicial = c.model_copy(update={"confirmacao_portal": "nao_encontrado", "data_publicacao": None})
    coletar(db, inicial, origem="snapshot_local" if defeito == "snapshot" else "siconv_oficial")
    assert quantidade(db, Notificacao) == 0
    coletar(db, c)
    assert quantidade(db, Notificacao) == 1


def test_baseline_oficial_silenciosa_nao_vira_aviso_no_replay(contexto):
    db, _, c = contexto
    coletar(db, c, notificar=False)
    coletar(db, c)
    assert quantidade(db, CandidatoLegadoCaptura) == 1
    assert quantidade(db, Notificacao) == 0


def test_perda_e_retorno_da_confirmacao_nao_renotifica(contexto):
    db, _, c = contexto
    coletar(db, c)
    coletar(db, c.model_copy(update={"confirmacao_portal": "nao_encontrado", "data_publicacao": None}))
    coletar(db, c)
    assert quantidade(db, CandidatoLegadoCaptura) == 3
    assert quantidade(db, Notificacao) == 1


def test_mudanca_posterior_de_evidencia_nao_repete_aviso_de_novidade(contexto):
    db, _, c = contexto
    coletar(db, c)
    evidencia = c.evidencias[0].model_copy(update={"descricao": "Aquisição de mamógrafo atualizado"})
    coletar(db, c.model_copy(update={"evidencias": (evidencia,)}))
    assert quantidade(db, CandidatoLegadoCaptura) == 2
    assert quantidade(db, Notificacao) == 1


def test_numero_ja_na_carteira_nao_cria_candidato_ou_aviso(contexto):
    db, _, c = contexto
    coletar(db, c.model_copy(update={"numero": "123"}))
    assert quantidade(db, CandidatoLegadoRegistro) == quantidade(db, Notificacao) == 0


def test_falha_do_aviso_reverte_captura_candidato_e_destinatarios(contexto, monkeypatch):
    from app.services import avisos_descoberta_legado as avisos

    db, _, c = contexto
    original = avisos.criar_avisos_descoberta

    def falhar(db, lote):
        original(db, lote)
        db.flush()
        raise RuntimeError("Falha sintética após materializar aviso")

    monkeypatch.setattr(avisos, "criar_avisos_descoberta", falhar)
    with pytest.raises(RuntimeError, match="sintética"):
        coletar(db, c)
    for modelo in (CandidatoLegadoRegistro, CandidatoLegadoCaptura, Notificacao, NotificacaoDestinatario):
        assert quantidade(db, modelo) == 0


def test_lote_com_segundo_candidato_invalido_reverte_primeiro(contexto):
    db, _, c = contexto
    ruim = c.model_copy(
        update={
            "numero": "999002",
            "id_proposta": "111002",
            "evidencias": (c.evidencias[0].model_copy(update={"codigo_equipamento": "inexistente"}),),
        }
    )
    with pytest.raises(ValidationError):
        registrar_descoberta(
            db=db,
            candidatos=[c, ruim],
            referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="b" * 64),
        )
    assert quantidade(db, CandidatoLegadoRegistro) == quantidade(db, Notificacao) == 0


def test_duas_sessoes_mesma_descoberta_geram_um_aviso(contexto):
    db, _, c = contexto
    bind = db.get_bind()
    barreira = Barrier(2)

    def executar():
        with Session(bind) as sessao:
            barreira.wait(timeout=10)
            return coletar(sessao, c)

    with ThreadPoolExecutor(max_workers=2) as pool:
        tarefas = [pool.submit(executar) for _ in range(2)]
        assert sorted(t.result(timeout=20) for t in tarefas) == [0, 1]
    assert quantidade(db, CandidatoLegadoCaptura) == quantidade(db, Notificacao) == 1
