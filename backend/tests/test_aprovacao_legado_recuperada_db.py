"""Aprovação interna contra PostgreSQL sintético, sem carteira operacional."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    Convenio,
    EquipamentoMarcador,
    InstrumentoEquipamento,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
)
from app.db.models_legado import CandidatoLegadoDecisao
from app.domain_errors import AuthorizationError, ConflictError
from app.services.aprovacao_legado import aprovar_entrada
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_revisao_legado_recuperada_db import preparar_prova


def quantidade(db, modelo):
    return db.scalar(select(func.count()).select_from(modelo))


def executar(db, usuario_id, ref, pedido):
    return aprovar_entrada(db=db, usuario_id=usuario_id, candidato_id=ref.candidato_id, dados=pedido)


@pytest.mark.parametrize("perfil", ["admin", "gestor"])
def test_aprova_replay_e_aviso_exclusivo_gerencial_sem_monitoramento(matriz, dados, perfil):
    db, usuarios, *_ = matriz
    ref, _, _, prova, pedido = preparar_prova(db, dados)
    decisao = executar(db, usuarios[perfil].id, ref, pedido)
    assert executar(db, usuarios[perfil].id, ref, pedido) == decisao
    salvo = db.get(CandidatoLegadoDecisao, decisao.id)
    assert salvo.recaptura_id == prova.id and salvo.convenio_id is not None and salvo.situacao == "aprovado"
    assert quantidade(db, Convenio) == 2 and quantidade(db, InstrumentoEquipamento) == 1
    assert quantidade(db, CandidatoLegadoDecisao) == quantidade(db, Notificacao) == 1
    aviso = db.scalar(select(Notificacao))
    assert aviso.tipo == NotificacaoTipo.aprovacao_carteira and aviso.entidade_id == salvo.convenio_id
    ids = set(db.scalars(select(NotificacaoDestinatario.usuario_id)))
    assert ids == {usuarios["admin"].id, usuarios["gestor"].id}
    marcadores = list(db.scalars(select(EquipamentoMarcador)))
    assert len(marcadores) == 1 and marcadores[0].relacao == "aquisicao"
    assert marcadores[0].convenio_id == salvo.convenio_id


@pytest.mark.parametrize("campo", ["justificativa", "versao", "hash_revisado", "recaptura_id", "captura_id", "ator"])
def test_chave_repetida_com_dados_diferentes_conflita(matriz, dados, campo):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    executar(db, usuarios["admin"].id, ref, pedido)
    usuario_id = usuarios["gestor"].id if campo == "ator" else usuarios["admin"].id
    if campo != "ator":
        valores = {
            "justificativa": "Outra justificativa",
            "versao": 123,
            "hash_revisado": "0" * 64,
            "recaptura_id": 999999,
            "captura_id": 999999,
        }
        pedido = pedido.model_copy(update={campo: valores[campo]})
    with pytest.raises(ConflictError):
        executar(db, usuario_id, ref, pedido)
    assert quantidade(db, Convenio) == 2 and quantidade(db, Notificacao) == 1


def test_nova_chave_nao_reabre_aprovacao_terminal(matriz, dados):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    executar(db, usuarios["admin"].id, ref, pedido)
    with pytest.raises(ConflictError, match="encerrada"):
        executar(db, usuarios["admin"].id, ref, pedido.model_copy(update={"chave": uuid4()}))


@pytest.mark.parametrize("perfil", ["titular", "leitor", "admin_excluido", "gestor_inativo"])
def test_perfil_sem_permissao_nao_inclui_nada(matriz, dados, perfil):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    with pytest.raises(AuthorizationError):
        executar(db, usuarios[perfil].id, ref, pedido)
    assert quantidade(db, Convenio) == 1
    assert (
        quantidade(db, CandidatoLegadoDecisao)
        == quantidade(db, Notificacao)
        == quantidade(db, EquipamentoMarcador)
        == 0
    )


def test_falha_apos_gravar_aviso_reverte_carteira_marcadores_decisao_e_destinatarios(matriz, dados, monkeypatch):
    from app.services import aprovacao_legado as service

    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    original = service.criar_notificacao

    def falhar(db, aviso):
        original(db, aviso)
        raise RuntimeError("Falha sintética de aviso")

    monkeypatch.setattr(service, "criar_notificacao", falhar)
    with pytest.raises(RuntimeError, match="sintética"):
        executar(db, usuarios["admin"].id, ref, pedido)
    assert quantidade(db, Convenio) == 1
    for modelo in (CandidatoLegadoDecisao, EquipamentoMarcador, Notificacao, NotificacaoDestinatario):
        assert quantidade(db, modelo) == 0


def test_duas_sessoes_mesma_chave_criam_uma_aprovacao(matriz, dados):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    usuario_id = usuarios["admin"].id
    db.commit()
    bind = db.get_bind()
    barreira = Barrier(2)

    def chamar():
        with Session(bind) as sessao:
            barreira.wait(timeout=10)
            return executar(sessao, usuario_id, ref, pedido).id

    with ThreadPoolExecutor(max_workers=2) as pool:
        tarefas = [pool.submit(chamar) for _ in range(2)]
        ids = [t.result(timeout=20) for t in tarefas]
    assert ids[0] == ids[1]
    assert quantidade(db, Convenio) == 2
    assert quantidade(db, CandidatoLegadoDecisao) == quantidade(db, Notificacao) == 1


def test_aprovacao_apos_analise_replay_confere_versao_anterior(matriz, dados):
    from app.schemas_legado import DecisaoLegadoCreate
    from app.services.decisoes_legado import registrar_decisao

    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    anterior = registrar_decisao(
        db=db,
        usuario=usuarios["admin"],
        candidato_id=ref.candidato_id,
        dados=DecisaoLegadoCreate(
            acao="iniciar_analise",
            chave=uuid4(),
            captura_id=ref.captura_id,
            versao=0,
            justificativa="Análise iniciada pela gestão",
        ),
    )
    pedido = pedido.model_copy(update={"versao": anterior.id})
    aprovada = executar(db, usuarios["admin"].id, ref, pedido)
    assert aprovada.situacao_anterior == "em_analise"
    assert executar(db, usuarios["admin"].id, ref, pedido) == aprovada
    with pytest.raises(ConflictError):
        executar(db, usuarios["admin"].id, ref, pedido.model_copy(update={"versao": 0}))
    assert quantidade(db, CandidatoLegadoDecisao) == 2 and quantidade(db, Notificacao) == 1


@pytest.mark.parametrize("defeito", ["sem_recaptura", "sem_convenio", "recaptura_alheia"])
def test_banco_exige_vinculos_de_aprovacao_sem_depender_do_service(matriz, dados, defeito):
    db, usuarios, *_ = matriz
    ref, _, _, prova, _ = preparar_prova(db, dados)
    convenio = Convenio(numero="999001", convenente_nome="Instituição sintética")
    db.add(convenio)
    db.flush()
    decisao = CandidatoLegadoDecisao(
        candidato_id=ref.candidato_id,
        captura_id=ref.captura_id,
        usuario_id=usuarios["admin"].id,
        chave=uuid4(),
        situacao_anterior="novo",
        situacao="aprovado",
        justificativa="Teste das restrições do banco",
        convenio_id=None if defeito == "sem_convenio" else convenio.id,
        recaptura_id=None if defeito == "sem_recaptura" else 999999 if defeito == "recaptura_alheia" else prova.id,
    )
    with pytest.raises(IntegrityError) as erro, db.begin_nested():
        db.add(decisao)
        db.flush()
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.diag.constraint_name == (
        "fk_legado_decisao_recaptura_identidade"
        if defeito == "recaptura_alheia"
        else "ck_legado_decisao_aprovacao_vinculos"
    )
